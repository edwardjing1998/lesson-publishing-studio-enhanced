import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGenericExerciseSpec,genericExerciseRequest} from '../shared/generic-exercise-spec.mjs';
import {buildAnyExerciseHtml} from '../src/exercise-html.mjs';
const sample={title:'Fractions and reasoning',instructions:'Explain your thinking',questions:[
 {kind:'multiple_choice',prompt:'Which is equivalent to 1/2?',options:['2/4','1/3','3/8'],correctIndex:0,explanation:'2/4 simplifies to 1/2.',sourceEvidence:'1/2',reasoningSteps:[{title:'Compare fractions',explanation:'Multiply numerator and denominator by 2.'}]},
 {kind:'numeric',prompt:'What is 2+3?',answer:5,tolerance:0,explanation:'Add 2 and 3.',sourceEvidence:'2+3',reasoningSteps:[]},
 {kind:'short_text',prompt:'Name the shape.',acceptedAnswers:['triangle'],explanation:'It has three sides.',sourceEvidence:'triangle',reasoningSteps:[]},
 {kind:'open_response',prompt:'Explain the method.',sampleAnswer:'Explain the steps.',rubric:'Check clarity and correctness.',explanation:'Discuss your reasoning.',sourceEvidence:'method',reasoningSteps:[]}
]};
test('generic schema accepts different topics and formats',()=>{
 const out=validateGenericExerciseSpec(sample,4);
 assert.equal(out.schema,'studio-generic-exercise/v1');assert.equal(out.questions[2].kind,'short_text');
});
test('generic request supports auto grade and specific formats',()=>{
 assert.equal(genericExerciseRequest({}).exerciseType,'auto');
 assert.equal(genericExerciseRequest({grade:'7',exerciseType:'open_response'}).grade,7);
 assert.throws(()=>genericExerciseRequest({grade:13}));
});
test('invalid answer shapes are rejected',()=>{
 assert.throws(()=>validateGenericExerciseSpec({...sample,questions:[{...sample.questions[0],correctIndex:12}]},1));
 assert.throws(()=>validateGenericExerciseSpec({...sample,questions:[{...sample.questions[1],answer:'5'}]},1));
 assert.throws(()=>validateGenericExerciseSpec({...sample,questions:[{...sample.questions[0],kind:'custom_js'}]},1));
});
test('renderer escapes model-provided text and provides on-demand steps',()=>{
 const raw={...sample,title:'<script>alert(1)</script>',questions:[{...sample.questions[0],prompt:'<img src=x onerror=alert(1)>'}]};
 const html=buildAnyExerciseHtml(validateGenericExerciseSpec(raw,1));
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/Show first step/);
 assert.match(html,/connect-src 'none'/);
});
test('open-response questions use review rubric, not automatic grading',()=>{
 const html=buildAnyExerciseHtml(validateGenericExerciseSpec({...sample,questions:[sample.questions[3]]},1));
 assert.match(html,/teacher assessment is recommended/i);
});
