// Only trusted local code builds HTML; model responses are treated exclusively as text.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function buildExerciseHtml(spec) {
  if (!spec || spec.schema !== 'studio-exercise/v1' || !Array.isArray(spec.questions)) {
    throw new Error('Exercise specification is not valid.');
  }
  const questions = spec.questions.map((q,index) => `
    <section class="question" data-answer="${Number(q.correctIndex)}">
      <h2>${index + 1}. ${escapeHtml(q.prompt)}</h2>
      <div class="options">${q.options.map((option,n) => `<label><input type="radio" name="q${index}" value="${n}"> ${escapeHtml(option)}</label>`).join('')}</div>
      <p class="feedback" aria-live="polite"></p>
      <p class="explanation" hidden>${escapeHtml(q.explanation)}</p>
    </section>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; connect-src 'none'">
<title>${escapeHtml(spec.title)}</title>
<style>body{margin:0;background:#edf3fa;color:#17283e;font:16px/1.55 system-ui,sans-serif}main{max-width:850px;margin:32px auto;padding:28px;background:white;border-radius:14px;box-shadow:0 6px 24px #162f4b18}h1{margin:0 0 8px;color:#123f72}.subtitle{color:#526478;margin-bottom:26px}.question{padding:20px 0;border-top:1px solid #dce5f0}h2{font-size:19px;margin:0 0 15px}.options{display:grid;gap:8px}.options label{display:block;padding:10px 14px;border:1px solid #bdcddd;border-radius:8px;cursor:pointer}.options label:has(input:checked){border-color:#1762b0;background:#edf5ff}.feedback{font-weight:700}.feedback.correct{color:#19713d}.feedback.incorrect{color:#ab2525}.explanation{padding:12px;background:#edf4fc;border-radius:8px}button{border:0;border-radius:8px;background:#174f8d;color:white;font:inherit;font-weight:700;padding:12px 20px;cursor:pointer}#score{font-weight:700;margin:16px 0}footer{margin-top:24px;font-size:12px;color:#66778a}@media(max-width:600px){main{margin:0;padding:16px;border-radius:0}}</style>
</head><body><main><h1>${escapeHtml(spec.title)}</h1><p class="subtitle">${escapeHtml(spec.instructions)}</p><form id="exercise">${questions}<button type="submit">Check answers</button> <button type="reset">Try again</button><p id="score" role="status" aria-live="polite"></p></form><footer>AI-generated practice activity. Review questions and answers before sharing with students.</footer></main>
<script>(function(){const form=document.getElementById('exercise');form.addEventListener('submit',function(e){e.preventDefault();let score=0;let completed=0;const items=[...document.querySelectorAll('.question')];items.forEach(function(item){const chosen=item.querySelector('input:checked');const feedback=item.querySelector('.feedback');const explanation=item.querySelector('.explanation');const answer=Number(item.dataset.answer);if(!chosen){feedback.textContent='Please select an answer.';feedback.className='feedback incorrect';explanation.hidden=true;return;}completed++;const correct=Number(chosen.value)===answer;if(correct)score++;feedback.textContent=correct?'Correct!':'Not quite. The correct answer is '+item.querySelectorAll('input')[answer].parentElement.textContent.trim();feedback.className='feedback '+(correct?'correct':'incorrect');explanation.hidden=false;});document.getElementById('score').textContent='Score: '+score+' / '+items.length+(completed<items.length?' ('+(items.length-completed)+' unanswered)':'');});form.addEventListener('reset',function(){requestAnimationFrame(function(){document.querySelectorAll('.feedback').forEach(function(node){node.textContent='';node.className='feedback';});document.querySelectorAll('.explanation').forEach(function(node){node.hidden=true;});document.getElementById('score').textContent='';});});})();</script></body></html>`;
}

// Escaped data only. Inline diagram and student interaction are deterministic local code.
export function buildGeometryReasoningHtml(spec) {
  if(!spec || spec.schema!=='studio-geometry-reasoning/v1' || !Array.isArray(spec.questions))throw new Error('Invalid geometry exercise specification.');
  const questions=spec.questions.map((q,i)=>{
    const steps=q.reasoningSteps.map((step,j)=>`<li class="step" hidden data-step="${j}"><strong>${escapeHtml(step.title)}</strong><p>${escapeHtml(step.explanation)}</p></li>`).join('');
    return `<section class="question" data-answer="${Number(q.answer)}">
      <h2>Question ${i+1}</h2><p>${escapeHtml(q.prompt)}</p>
      ${q.context?`<p class="context">${escapeHtml(q.context)}</p>`:''}
      <svg viewBox="0 0 360 225" role="img" aria-label="Triangle ABC; angle A ${Number(q.angleA)} degrees, angle B ${Number(q.angleB)} degrees, angle C unknown. Diagram not to scale.">
        <path d="M65 180 L298 180 L157 28 Z" fill="#e7efff" stroke="#25589d" stroke-width="3"/>
        <text x="155" y="19">C = ?</text><text x="24" y="201">A = ${Number(q.angleA)}°</text><text x="263" y="201">B = ${Number(q.angleB)}°</text>
      </svg><p class="not-scale">Diagram not to scale.</p>
      <label class="answer-label">Angle C (degrees): <input type="number" min="0" max="180" step="1" inputmode="numeric" aria-label="Angle C for question ${i+1}"></label>
      <button class="check" type="button">Check answer</button><p class="feedback" aria-live="polite"></p>
      <div class="hints"><h3>Reasoning help (on demand)</h3>
        <button type="button" class="next">Show first hint</button>
        <button type="button" class="all">Show full solution</button>
        <button type="button" class="hide">Hide steps</button>
        <ol>${steps}</ol>
      </div></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>${escapeHtml(spec.title)}</title>
<style>
body{margin:0;background:#edf3fa;color:#1c2f48;font:16px/1.6 system-ui,sans-serif} main{max-width:860px;margin:25px auto;background:#fff;border-radius:12px;padding:25px}h1{color:#164778;margin-top:0}.question{padding:20px 0;border-top:1px solid #cad8e8}h2{margin:0 0 8px}svg{width:100%;max-width:440px;display:block;margin:12px auto}svg text{font:17px system-ui,sans-serif;fill:#14365c;font-weight:650}.not-scale{text-align:center;color:#52677e;font-size:12px}.answer-label{display:block;font-weight:650;margin:14px 0}input{font:inherit;padding:7px;width:90px;border:1px solid #91a6be;border-radius:5px}button{font:inherit;border:0;background:#18558d;color:#fff;border-radius:7px;padding:9px 14px;cursor:pointer;margin:3px}.hints{margin-top:14px;background:#f0f6fc;border:1px solid #c8daed;padding:15px;border-radius:9px}.hints h3{margin:0 0 7px}.hints .hide{background:#586b7c}.step{padding:8px 4px;border-top:1px solid #d6e1ee}.step p{margin:3px 0}.feedback{font-weight:700}.feedback.ok{color:#146b37}.feedback.no{color:#a33}.context{color:#4c6176}footer{margin-top:20px;color:#53677b;font-size:12px}@media(max-width:600px){main{margin:0;border-radius:0;padding:14px}}
</style></head><body><main><h1>${escapeHtml(spec.title)}</h1><p>${escapeHtml(spec.instructions)}</p>${questions}
<footer>Generated geometry questions and reasoning require teacher review before classroom use. Students can request steps without making further AI calls.</footer></main>
<script>(function(){
 document.querySelectorAll('.question').forEach(function(q){
  const steps=[...q.querySelectorAll('.step')];let visible=0;
  function reveal(n){visible=n;steps.forEach((s,i)=>s.hidden=i>=visible);q.querySelector('.next').textContent=visible?'Show next step':'Show first hint';q.querySelector('.next').disabled=visible>=steps.length;}
  q.querySelector('.next').addEventListener('click',()=>reveal(Math.min(visible+1,steps.length)));
  q.querySelector('.all').addEventListener('click',()=>reveal(steps.length));
  q.querySelector('.hide').addEventListener('click',()=>reveal(0));
  q.querySelector('.check').addEventListener('click',function(){const input=q.querySelector('input');const feedback=q.querySelector('.feedback');const entered=input.value.trim();if(!entered){feedback.textContent='Enter an angle first.';feedback.className='feedback no';return;}const ok=Number(entered)===Number(q.dataset.answer);feedback.textContent=ok?'Correct! Explain why the three triangle angles add to 180°.':'Not quite. Check your angle sum, or request a hint.';feedback.className='feedback '+(ok?'ok':'no');});
 });
})();</script></body></html>`;
}

import {buildGenericExerciseHtml} from './generic-exercise-html.mjs';
const buildMultipleChoiceHtml=buildExerciseHtml;
export function buildAnyExerciseHtml(spec){
  if(spec?.schema==='studio-generic-exercise/v1')return buildGenericExerciseHtml(spec);
  if(spec?.schema==='studio-geometry-reasoning/v1')return buildGeometryReasoningHtml(spec);
  return buildMultipleChoiceHtml(spec);
}
