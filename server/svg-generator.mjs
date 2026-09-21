const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);

function fallbackSvg(request, activity, template = 'classroom') {
  const colors = { classroom: ['#14213d', '#fca311'], colorful: ['#5b21b6', '#f97316'], worksheet: ['#111827', '#2563eb'], geometry: ['#064e3b', '#10b981'], minimal: ['#374151', '#6b7280'] };
  const [primary, accent] = colors[template] || colors.classroom;
  const label = `${activity?.title || 'Activity'} — ${request.purpose || 'Learning illustration'}`.slice(0, 110);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 420" role="img" aria-label="${esc(label)}"><rect width="1000" height="420" rx="24" fill="#fff" stroke="${accent}" stroke-width="8"/><rect x="55" y="55" width="890" height="100" rx="16" fill="${primary}" opacity=".1"/><text x="500" y="120" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="${primary}">${esc(activity?.title || 'Learning activity')}</text><circle cx="500" cy="245" r="70" fill="${accent}" opacity=".18"/><path d="M455 245h90M500 200v90" stroke="${primary}" stroke-width="12" stroke-linecap="round"/><text x="500" y="365" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="${primary}">${esc(request.purpose || 'Explore this idea')}</text></svg>`;
}

function extractSvg(text) {
  const value = String(text || '').replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = value.indexOf('<svg');
  const end = value.lastIndexOf('</svg>');
  return start >= 0 && end > start ? value.slice(start, end + 6) : '';
}

function validateSvg(svg) {
  if (!svg || !/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new Error('Model did not return a complete SVG');
  if (/<script\b|on[a-z]+\s*=|javascript:|<foreignObject\b|<iframe\b/i.test(svg)) throw new Error('Unsafe SVG returned by model');
  if (!/viewBox\s*=/.test(svg)) throw new Error('SVG must contain a viewBox');
  if (Buffer.byteLength(svg, 'utf8') > 500_000) throw new Error('Generated SVG is too large');
  return svg;
}

export async function generateActivitySvg({ request, activity, template = 'classroom' }) {
  const fallback = () => fallbackSvg(request, activity, template);
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  if (!endpoint || !deployment || !process.env.AZURE_OPENAI_API_KEY) return fallback();

  const context = {
    title: activity?.title,
    objective: activity?.objective,
    instructions: activity?.instructions_markdown,
    blocks: (activity?.blocks || []).map(block => block.markdown),
    solution: activity?.solution_markdown,
    imagePurpose: request.purpose,
    imagePrompt: request.prompt
  };

  const system = `You create one educational SVG illustration for a middle-school learning activity. Return SVG markup only, with no Markdown fences or explanation. Base the drawing on the supplied activity and image request. Use accurate visible labels only when supported by the activity. Use a 1000x600 viewBox, readable colors, and simple vector shapes. Never include script, foreignObject, event handlers, external URLs, or embedded HTML.`;
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000),
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY },
    body: JSON.stringify({
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(context) }],
      temperature: 0.2,
      max_tokens: 5000
    })
  });
  if (!response.ok) throw new Error(`SVG model request failed (${response.status})`);
  const data = await response.json();
  return validateSvg(extractSvg(data.choices?.[0]?.message?.content));
}

export { fallbackSvg };
