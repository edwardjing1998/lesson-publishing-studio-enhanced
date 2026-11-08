import {useMemo,useState} from 'react';
import {buildAnyExerciseHtml} from './exercise-html.mjs';

const FORMATS=[
  ['auto','Automatic (based on Markdown)'],['mixed','Mixed question types'],
  ['multiple_choice','Multiple choice'],['numeric','Numeric answer'],
  ['short_text','Short text answer'],['open_response','Written reasoning / explanation']
];
export default function RevisionExerciseTab({revisionId,markdownBlob}) {
  const [type,setType]=useState('auto');
  const [grade,setGrade]=useState('');
  const [instructions,setInstructions]=useState('Use the main learning objectives of the selected Markdown. Provide student-friendly reasoning steps that can be revealed on demand.');
  const [count,setCount]=useState(3);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [exercise,setExercise]=useState(null);
  const html=useMemo(()=>exercise?buildAnyExerciseHtml(exercise):'',[exercise]);
  async function generate(event){
    event.preventDefault();setBusy(true);setError('');setExercise(null);
    try{
      const response=await fetch(`/api/v1/markdown/corrections/${encodeURIComponent(revisionId)}/exercise/generate`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({markdownBlob,questionCount:Number(count),instructions,exerciseType:type,grade:grade===''?null:Number(grade)})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
      if(data.revisionId!==revisionId||data.schema!=='studio-generic-exercise/v1')throw new Error('Unexpected exercise response.');
      setExercise(data);
    }catch(err){setError(err.message||'Exercise generation failed.');}
    finally{setBusy(false);}
  }
  function download(){
    if(!html)return;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`exercise-${revisionId.slice(0,8)}.html`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <div className="revision-exercise-pane">
    <form className="revision-exercise-form" onSubmit={generate}>
      <div><h3>Generate exercises from saved Markdown</h3><p>Works with any subject or mathematics topic supported by the source. Uses saved revision <code>{revisionId.slice(0,8)}</code>. Review generated content before publishing.</p></div>
      <label>Question format<select value={type} disabled={busy} onChange={e=>{setType(e.target.value);setExercise(null);setError('');}}>
        {FORMATS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Grade (optional)<select value={grade} onChange={e=>setGrade(e.target.value)} disabled={busy}>
        <option value="">Auto-detect from source</option>{Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>Grade {n}</option>)}
      </select></label>
      <label>Number of questions<select value={count} onChange={e=>setCount(Number(e.target.value))} disabled={busy}>
        {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} questions</option>)}
      </select></label>
      <label>Teacher instructions<textarea rows={4} maxLength={1500} value={instructions} onChange={e=>setInstructions(e.target.value)} disabled={busy}/></label>
      <p className="revision-geometry-note">The generator selects appropriate questions from the saved Markdown, creates explanations and optional step-by-step hints. Numeric and short-text answers use simple checks; open responses use a sample answer/rubric and require human review.</p>
      <div className="revision-exercise-buttons">
        <button type="submit" disabled={busy}>{busy?'Generating exercises…':'Generate Exercise Web Page'}</button>
        <button type="button" disabled={!exercise||busy} onClick={download}>Download Exercise HTML</button>
      </div>
    </form>
    {error&&<p className="revision-layout-error" role="alert">{error}</p>}
    {busy&&<p role="status" className="revision-layout-message">Azure OpenAI is generating exercises. Keep this modal open.</p>}
    {exercise&&<><div className="revision-exercise-preview-heading"><strong>Interactive exercise preview</strong><span>{new Date(exercise.generatedAt).toLocaleString()} · Review answers and reasoning before sharing</span></div>
      <iframe key={exercise.generatedAt} className="revision-exercise-frame" title="AI-generated exercise page" sandbox="allow-scripts" srcDoc={html}/>
    </>}
  </div>;
}
