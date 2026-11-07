import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAzureRetryAfterMs, retryDelayMs, createAzureOpenAIRetryTransport
} from '../server/azure-openai-retry.mjs';

const response = (status, headers = {}) => new Response('{}', {status, headers});

test('Azure retry headers support milliseconds, seconds and HTTP date', () => {
  assert.equal(parseAzureRetryAfterMs(new Headers({'retry-after-ms':'2500'})), 2500);
  assert.equal(parseAzureRetryAfterMs(new Headers({'retry-after':'3'})), 3000);
  assert.equal(parseAzureRetryAfterMs(new Headers({'retry-after':'Wed, 21 Oct 2026 07:28:00 GMT'}),
    Date.parse('Wed, 21 Oct 2026 07:27:58 GMT')), 2000);
  assert.equal(parseAzureRetryAfterMs(new Headers()), null);
});

test('retry uses jitter only when Azure supplies no wait duration', () => {
  assert.equal(retryDelayMs(0, new Headers(), {baseMs:4000, random:() => 0}), 2000);
  assert.equal(retryDelayMs(2, new Headers(), {baseMs:4000, random:() => 1}), 16000);
  assert.equal(retryDelayMs(0, new Headers({'retry-after-ms':'8000'})), 8000);
});

test('429 retries and honors retry-after-ms', async () => {
  let calls=0, clock=0;
  const sleeps=[], events=[];
  const transport=createAzureOpenAIRetryTransport({
    fetchImpl:async()=>{calls++;return response(calls===1?429:200, calls===1?{'retry-after-ms':'7500'}:{});},
    sleepImpl:async ms=>{sleeps.push(ms);clock+=ms;},now:()=>clock,
    minIntervalMs:0,maxRetries:3
  });
  const result=await transport.request('https://example.invalid',{}, {onRetry:info=>events.push(info)});
  assert.equal(result.status,200);
  assert.equal(calls,2);
  assert.deepEqual(sleeps,[7500]);
  assert.equal(events[0].status,429);
});

test('exhausted 429 returns response rather than looping forever', async () => {
  let calls=0;
  const transport=createAzureOpenAIRetryTransport({
    fetchImpl:async()=>{calls++;return response(429);},
    sleepImpl:async()=>{},now:()=>0,random:()=>0,minIntervalMs:0,
    maxRetries:2,baseDelayMs:1000,maxDelayMs:10000
  });
  const result=await transport.request('https://example.invalid',{});
  assert.equal(result.status,429);
  assert.equal(calls,3);
});

test('transport serializes concurrent callers', async () => {
  let active=0,peak=0;
  const transport=createAzureOpenAIRetryTransport({minIntervalMs:0,maxRetries:0,
    fetchImpl:async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return response(200);}
  });
  await Promise.all([transport.request('x',{}),transport.request('x',{})]);
  assert.equal(peak,1);
});
