const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// Deterministic SVG generation for safe educational illustrations.
// It creates a readable visual card from the model's image request without
// inventing mathematical labels or executing model-provided markup.
export function createActivitySvg(request, template = 'classroom') {
  const colors = { classroom: ['#14213d','#fca311'], colorful: ['#5b21b6','#f97316'], worksheet: ['#111827','#2563eb'], geometry: ['#064e3b','#10b981'], minimal: ['#374151','#6b7280'] };
  const [primary, accent] = colors[template] || colors.classroom;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 420" role="img" aria-label="${esc(request.purpose)}"><rect width="1000" height="420" rx="24" fill="#fff" stroke="${accent}" stroke-width="8"/><circle cx="500" cy="145" r="82" fill="${primary}" opacity=".12"/><path d="M420 250 L500 95 L580 250 Z" fill="none" stroke="${primary}" stroke-width="8"/><path d="M500 95 V250" stroke="${accent}" stroke-width="6" stroke-dasharray="12 10"/><text x="500" y="320" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="${primary}">${esc(request.purpose)}</text></svg>`;
}
