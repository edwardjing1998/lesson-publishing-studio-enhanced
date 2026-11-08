// Safe, topic-neutral HTML renderer. The AI supplies ONLY text/JSON, never HTML.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const asJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

const RENDERERS={
  multiple_choice:(q,i)=>`<fieldset><legend>Choose one answer</legend>${q.options.map((opt,n)=>`<label class="option"><input type="radio" name="q${i}" value="${n}"> ${esc(opt)}</label>`).join('')}</fieldset>`,
  numeric:(q,i)=>`<label>Enter a number${q.unit?` (${esc(q.unit)})`:''}<input type="number" step="any" name="q${i}" inputmode="decimal"></label>`,
  short_text:(q,i)=>`<label>Your answer<input type="text" name="q${i}" maxlength="250"></label>`,
  open_response:(q,i)=>`<label>Explain your thinking<textarea name="q${i}" rows="5" maxlength="2500"></textarea></label>`
};
export function buildGenericExerciseHtml(spec){
  if(spec?.schema!=='studio-generic-exercise/v1'||!Array.isArray(spec.questions)||
    spec.questions.some(q=>!Object.hasOwn(RENDERERS,q.kind)))throw new Error('Invalid generic exercise specification.');
  const questions=spec.questions.map((q,i)=>`<section class="question" data-index="${i}"><h2>${i+1}. ${esc(q.prompt)}</h2>
    ${RENDERERS[q.kind](q,i)}
    <button type="button" class="check">Check answer</button><p class="feedback" role="status"></p>
    <div class="hints"><strong>Reasoning help (optional)</strong>
      <button type="button" class="next">Show first step</button><button type="button" class="all">Show all steps</button>
      <button type="button" class="hide">Hide steps</button>
      <ol>${q.reasoningSteps.map(s=>`<li hidden><strong>${esc(s.title)}</strong><p>${esc(s.explanation)}</p></li>`).join('')}</ol>
    </div><details class="solution"><summary>Show solution / explanation</summary>
      ${q.kind==='open_response'?`<p><strong>Sample answer:</strong> ${esc(q.sampleAnswer)}</p><p><strong>Rubric:</strong> ${esc(q.rubric)}</p>`:''}
      <p>${esc(q.explanation)}</p></details></section>`).join('');
  // Answers are embedded as inert JSON data, not interpolated into JavaScript source.
  // The student can inspect HTML, so this is a practice tool, NOT secure exam grading.
  const data=asJSON(spec.questions.map(q=>({kind:q.kind,correctIndex:q.correctIndex,answer:q.answer,tolerance:q.tolerance,
    acceptedAnswers:q.acceptedAnswers,stepCount:q.reasoningSteps.length})));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>${esc(spec.title)}</title><style>
body{margin:0;background:#eef3f8;color:#172b42;font:16px/1.6 system-ui,sans-serif}main{max-width:880px;margin:30px auto;background:white;padding:28px;border-radius:14px}h1{color:#164877}.question{padding:22px 0;border-top:1px solid #d3dce7}h2{font-size:1.15rem}.option{display:block;border:1px solid #bed0e2;border-radius:7px;padding:8px;margin:7px 0;cursor:pointer}fieldset{border:0;padding:0}legend{font-weight:600}input[type=text],input[type=number],textarea{display:block;width:min(100%,650px);box-sizing:border-box;padding:10px;border:1px solid #afc1d4;border-radius:7px;font:inherit}button{font:inherit;cursor:pointer;background:#1a568e;color:#fff;border:0;border-radius:7px;padding:9px 12px;margin:4px 5px 4px 0}button:disabled{opacity:.55;cursor:default}.hints{background:#edf5fc;padding:14px;border-radius:10px;margin-top:12px}.hints ol{padding-left:22px}.hints li{margin:8px 0}.feedback{font-weight:700}.feedback.ok{color:#176c38}.feedback.no{color:#ad2f2f}.solution{background:#faf6e8;padding:12px;margin-top:12px;border-radius:8px}.solution summary{cursor:pointer;font-weight:600}footer{font-size:12px;color:#5b6876}@media(max-width:600px){main{margin:0;padding:16px;border-radius:0}}
</style></head><body><main><h1>${esc(spec.title)}</h1><p>${esc(spec.instructions)}</p>${questions}
<footer>AI-generated exercise; teacher review required. Answers stored in this page are for practice, not high-stakes assessment.</footer></main>
<script type="application/json" id="exercise-data">${data}</script>
<script>(function(){
 const specs=JSON.parse(document.getElementById('exercise-data').textContent);
 document.querySelectorAll('.question').forEach(function(section){
  const q=specs[Number(section.dataset.index)],steps=Array.from(section.querySelectorAll('.hints li'));
  let visible=0;
  function reveal(n){visible=n;steps.forEach((s,i)=>s.hidden=i>=n);const button=section.querySelector('.next');button.disabled=visible>=steps.length;button.textContent=visible?'Show next step':'Show first step';}
  section.querySelector('.next').onclick=()=>reveal(Math.min(visible+1,steps.length));
  section.querySelector('.all').onclick=()=>reveal(steps.length);
  section.querySelector('.hide').onclick=()=>reveal(0);
  section.querySelector('.check').onclick=function(){
   const input=q.kind==='multiple_choice'?section.querySelector('input:checked'):section.querySelector('input,textarea');
   const feedback=section.querySelector('.feedback');
   if(!input||!String(input.value).trim()){feedback.textContent='Please enter an answer first.';feedback.className='feedback no';return;}
   if(q.kind==='open_response'){feedback.textContent='Written reasoning saved in this page. Compare with the sample answer and rubric below; teacher assessment is recommended.';feedback.className='feedback';section.querySelector('.solution').open=true;return;}
   let correct=false;
   if(q.kind==='multiple_choice')correct=Number(input.value)===q.correctIndex;
   if(q.kind==='numeric')correct=Number.isFinite(Number(input.value)) && Math.abs(Number(input.value)-q.answer)<=q.tolerance;
   if(q.kind==='short_text')correct=q.acceptedAnswers.some(a=>a.trim().toLowerCase()===input.value.trim().toLowerCase());
   feedback.textContent=correct?'Correct!':'Not quite. Review your approach or request a reasoning step.';
   feedback.className='feedback '+(correct?'ok':'no');
  };
  reveal(0);
 });
})();</script></body></html>`;
}
