import {splitMarkdownFrontMatter} from './markdown-blocks.mjs';
const bad = (message, statusCode = 400) => Object.assign(new Error(message), {statusCode});

export function validateExerciseSpec(raw, count) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('AI returned an invalid exercise object.', 502);
  const title = String(raw.title || '').trim().slice(0, 160);
  const instructions = String(raw.instructions || '').trim().slice(0, 600);
  if (!title || !Array.isArray(raw.questions) || raw.questions.length !== count) {
    throw bad(`AI must return a title and exactly ${count} questions.`, 502);
  }
  const questions = raw.questions.map((q, i) => {
    if (!q || typeof q !== 'object' || Array.isArray(q) ||
      typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1200 ||
      !Array.isArray(q.options) || q.options.length !== 4 ||
      q.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 500) ||
      !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 ||
      typeof q.explanation !== 'string' || !q.explanation.trim() || q.explanation.length > 1200) {
      throw bad(`AI returned an invalid question at position ${i + 1}.`, 502);
    }
    const distinct = new Set(q.options.map(option => option.trim().toLowerCase()));
    if (distinct.size !== 4) throw bad(`Question ${i + 1} has duplicate choices.`, 502);
    return {
      id: i + 1,
      prompt: q.prompt.trim(),
      options: q.options.map(option => option.trim()),
      correctIndex: q.correctIndex,
      explanation: q.explanation.trim(),
      sourceEvidence: typeof q.sourceEvidence === 'string' ? q.sourceEvidence.slice(0, 600).trim() : ''
    };
  });
  return {schema:'studio-exercise/v1', title, instructions, questions};
}

export function exerciseSource(markdown, maxChars = 14000) {
  const source = splitMarkdownFrontMatter(markdown).body.trim();
  if (!source) throw bad('Saved revision has no body content for exercises.', 422);
  if (source.length > maxChars) throw bad('Saved revision is too long for a single exercise generation. Use a shorter page.', 413);
  return source;
}

export function exerciseRequest(body) {
  const count = Number(body?.questionCount ?? 4);
  if (!Number.isInteger(count) || count < 2 || count > 8) throw bad('questionCount must be between 2 and 8.');
  const notes = String(body?.instructions || '');
  if (notes.length > 1500) throw bad('AI instructions exceed 1,500 characters.');
  return {count, notes:notes.trim()};
}


// First supported reasoning family: the triangle interior-angle sum theorem.
// All student-facing solution steps are computed from verified numeric givens.
export function validateGeometryReasoningSpec(raw, count, grade = 7) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.questions) || raw.questions.length !== count) {
    throw bad(`AI must return exactly ${count} triangle-angle reasoning questions.`, 502);
  }
  const questions = raw.questions.map((q, i) => {
    const a = q?.angleA, b = q?.angleB;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 10 || b < 10 || a > 150 || b > 150 || a + b >= 170 ||
        typeof q?.context !== 'string' || q.context.length > 400 ||
        (q?.theorem && q.theorem !== 'triangle_angle_sum')) {
      throw bad(`Invalid geometric givens in question ${i+1}.`, 502);
    }
    const c = 180-a-b;
    if (c < 10 || c > 160) throw bad(`Invalid triangle in question ${i+1}.`, 502);
    return {
      id:i+1, kind:'triangle_angle_sum', angleA:a, angleB:b, answer:c,
      prompt:`In triangle ABC, angle A is ${a}° and angle B is ${b}°. Find angle C and explain how you know.`,
      context:q.context.trim(),
      reasoningSteps:[
        {title:'Identify the rule', explanation:'The interior angles of every triangle add up to 180°.'},
        {title:'Write an equation', explanation:`${a}° + ${b}° + C = 180°.`},
        {title:'Add the known angles', explanation:`${a}° + ${b}° = ${a+b}°.`},
        {title:'Solve and conclude', explanation:`C = 180° − ${a+b}° = ${c}°.`}
      ]
    };
  });
  const unique = new Set(questions.map(q=>`${q.angleA},${q.angleB}`));
  if(unique.size !== questions.length) throw bad('AI returned duplicate triangle givens.',502);
  return {
    schema:'studio-geometry-reasoning/v1', exerciseType:'geometry_reasoning', grade,
    title:'Triangle Angle Reasoning',
    instructions:'Solve each triangle. Request hints only when needed; explain the angle-sum rule in your own words.',
    questions
  };
}

export function geometryRequest(body) {
  const kind=body?.exerciseType || 'multiple_choice';
  if (!['multiple_choice','geometry_reasoning'].includes(kind)) throw bad('Unsupported exerciseType.');
  const request=exerciseRequest(body);
  const grade=Number(body?.grade ?? 7);
  if (kind==='geometry_reasoning' && (!Number.isInteger(grade)||grade<6||grade>8)) {
    throw bad('Geometry reasoning currently supports grades 6–8.');
  }
  return {...request,exerciseType:kind,grade};
}
