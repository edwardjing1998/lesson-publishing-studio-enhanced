// Generic, topic-independent exercise contract. New question kinds can be added
// through the QUESTION_VALIDATORS registry and matching frontend renderers.
const fail = message => { const error = new Error(message); error.statusCode = 502; throw error; };
const text = (value, max, name, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${name} must be a string of at most ${max} characters.`);
  return value.trim();
};
const validateSteps = steps => {
  if (steps == null) return [];
  if (!Array.isArray(steps) || steps.length > 12) fail('reasoningSteps must contain at most 12 steps.');
  return steps.map((step, i) => ({
    title: text(step?.title, 160, `Step ${i + 1} title`),
    explanation: text(step?.explanation, 1500, `Step ${i + 1} explanation`)
  }));
};
const QUESTION_VALIDATORS = {
  multiple_choice(q) {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) fail('Multiple choice requires 2–6 options.');
    const options = q.options.map((v,i) => text(v, 350, `Option ${i+1}`));
    if (new Set(options.map(x=>x.toLowerCase())).size !== options.length) fail('Duplicate options are not allowed.');
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) fail('Invalid correctIndex.');
    return {options, correctIndex:q.correctIndex};
  },
  numeric(q) {
    if (typeof q.answer !== 'number' || !Number.isFinite(q.answer)) fail('Numeric question requires finite numeric answer.');
    if (q.tolerance != null && (typeof q.tolerance !== 'number' || !Number.isFinite(q.tolerance) || q.tolerance < 0 || q.tolerance > 1e9)) fail('Invalid numeric tolerance.');
    return {answer:q.answer,tolerance:q.tolerance ?? 0,unit:text(q.unit??'',60,'unit',false)};
  },
  short_text(q) {
    if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length < 1 || q.acceptedAnswers.length > 8) fail('Short-text questions require acceptedAnswers.');
    return {acceptedAnswers:q.acceptedAnswers.map((v,i)=>text(v,250,`Accepted answer ${i+1}`))};
  },
  open_response(q) {
    return {sampleAnswer:text(q.sampleAnswer,2000,'sampleAnswer'),rubric:text(q.rubric,1500,'rubric')};
  }
};
export const supportedQuestionKinds = Object.freeze(Object.keys(QUESTION_VALIDATORS));
export function validateGenericExerciseSpec(raw, expectedCount) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('AI must return a JSON object.');
  const title=text(raw.title,160,'title');
  const instructions=text(raw.instructions,600,'instructions');
  if(!Array.isArray(raw.questions) || raw.questions.length !== expectedCount) fail(`AI must return exactly ${expectedCount} questions.`);
  const questions=raw.questions.map((q,i)=>{
    if(!q || typeof q!=='object' || Array.isArray(q) || !Object.hasOwn(QUESTION_VALIDATORS,q.kind)) fail(`Unsupported question kind at ${i+1}.`);
    const base={id:i+1,kind:q.kind,prompt:text(q.prompt,1500,`Question ${i+1} prompt`),
      // Keep the summary concise, while detailed student-facing reasoning lives in reasoningSteps.
      explanation:text(q.explanation,1800,`Question ${i+1} explanation`),
      sourceEvidence:text(q.sourceEvidence,600,'sourceEvidence'),
      reasoningSteps:validateSteps(q.reasoningSteps)};
    return {...base,...QUESTION_VALIDATORS[q.kind](q)};
  });
  return {schema:'studio-generic-exercise/v1',title,instructions,questions};
}
export function genericExerciseRequest(body) {
  const questionCount=Number(body?.questionCount??4);
  if(!Number.isInteger(questionCount) || questionCount<1 || questionCount>8) {const e=new Error('questionCount must be 1–8.');e.statusCode=400;throw e;}
  const exerciseType=body?.exerciseType??'auto';
  if(!['auto','mixed','multiple_choice','numeric','short_text','open_response'].includes(exerciseType)) {const e=new Error('Unsupported exercise type.');e.statusCode=400;throw e;}
  const grade=body?.grade==null || body.grade==='' ? null : Number(body.grade);
  if(grade!==null && (!Number.isInteger(grade)||grade<1||grade>12)) {const e=new Error('grade must be 1–12 or omitted.');e.statusCode=400;throw e;}
  const instructions=String(body?.instructions??'');
  if(instructions.length>1500){const e=new Error('Instructions must be at most 1500 characters.');e.statusCode=400;throw e;}
  return {questionCount,exerciseType,grade,instructions:instructions.trim()};
}
