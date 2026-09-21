import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const escape = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]
  );

const md = value =>
  sanitizeHtml(marked.parse(String(value || '')), {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'code',
      'pre',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'sup',
      'sub'
    ],
    allowedAttributes: {},
    allowedSchemes: []
  });

const choices = activity =>
  activity.activity_type === 'MULTIPLE_CHOICE'
    ? `
      <fieldset
        class="choices"
        data-answer="${escape(activity.correct_choice_id)}"
      >
        <legend>Choose one answer</legend>

        ${activity.choices
          .map(
            choice => `
              <label>
                <input
                  type="radio"
                  name="answer"
                  value="${escape(choice.choice_id)}"
                >
                <b>${escape(choice.choice_id)}.</b>
                ${escape(choice.text)}
              </label>
            `
          )
          .join('')}

        <button type="button" id="check">
          Check answer
        </button>

        <p id="result" aria-live="polite"></p>
      </fieldset>
    `
    : '';

const themes = {
  classroom: {
    primary: '#14213d',
    accent: '#fca311',
    background: '#f4f7fb'
  },

  colorful: {
    primary: '#5b21b6',
    accent: '#f97316',
    background: '#fff7ed'
  },

  worksheet: {
    primary: '#111827',
    accent: '#2563eb',
    background: '#ffffff'
  },

  geometry: {
    primary: '#064e3b',
    accent: '#10b981',
    background: '#ecfdf5'
  },

  minimal: {
    primary: '#374151',
    accent: '#6b7280',
    background: '#f9fafb'
  }
};

export function renderActivity({
  activity,
  assetNames = {},
  typeLabel
}) {
  const template =
    process.env.HTML_TEMPLATE || 'classroom';

  const theme =
    themes[template] || themes.classroom;

  const blocks = activity.blocks
    .map(
      block => `
        <section class="block kind-${escape(
          block.kind.toLowerCase()
        )}">
          <span class="kind">
            ${escape(block.kind)}
          </span>

          ${md(block.markdown)}
        </section>
      `
    )
    .join('');

  /*
   * Render generated SVG or source image assets.
   *
   * assetNames maps an image ID to its file name:
   *
   * {
   *   "diagram-1": "diagram-1.svg",
   *   "figure-1": "figure-1.png"
   * }
   */
  const imageBlocks = (activity.image_requests || [])
    .map(request => {
      const fileName = assetNames[request.image_id];

      if (!fileName) {
        return `
          <figure class="generated-image">
            <div
              class="image-placeholder"
              data-image-id="${escape(request.image_id)}"
            >
              Image unavailable
            </div>

            <figcaption>
              ${escape(request.purpose)}
            </figcaption>
          </figure>
        `;
      }

      return `
        <figure class="generated-image">
          <img
            src="assets/${escape(fileName)}"
            alt="${escape(request.purpose)}"
          >

          <figcaption>
            ${escape(request.purpose)}
          </figcaption>
        </figure>
      `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >

        <meta
          http-equiv="Content-Security-Policy"
          content="
            default-src 'self';
            img-src 'self' data:;
            style-src 'unsafe-inline';
            script-src 'unsafe-inline';
            object-src 'none';
            base-uri 'none';
            form-action 'none'
          "
        >

        <title>${escape(activity.title)}</title>

        <style>
          :root {
            font-family: Inter, system-ui, sans-serif;
            color: #14213d;
            background: ${theme.background};
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
          }

          header {
            background: ${theme.primary};
            color: #ffffff;
            padding: 24px;
          }

          header p {
            color: ${theme.accent};
            font-weight: 700;
          }

          main {
            max-width: 900px;
            margin: auto;
            padding: 24px;
          }

          .objective,
          .block,
          .choices,
          details,
          .generated-image {
            background: #ffffff;
            border: 1px solid #dce4ee;
            border-radius: 12px;
            padding: 20px;
            margin: 16px 0;
          }

          .kind {
            display: block;
            font-size: 11px;
            font-weight: 800;
            color: ${theme.primary};
            margin-bottom: 8px;
          }

          .choices label {
            display: block;
            padding: 9px;
          }

          .choices button {
            padding: 9px 14px;
            cursor: pointer;
          }

          .generated-image img {
            display: block;
            width: 100%;
            max-width: 900px;
            max-height: 560px;
            margin: 0 auto;
            object-fit: contain;
          }

          .generated-image figcaption {
            text-align: center;
            margin-top: 10px;
            font-size: 0.9rem;
            color: #4b5563;
          }

          .image-placeholder {
            min-height: 130px;
            display: grid;
            place-items: center;
            border: 2px dashed ${theme.accent};
            color: ${theme.primary};
            text-align: center;
            padding: 16px;
          }

          details summary {
            cursor: pointer;
            font-weight: 700;
          }

          button:focus,
          input:focus {
            outline: 3px solid ${theme.accent};
          }

          /*
           * Template-specific styling
           */
          ${
            template === 'colorful'
              ? `
                header {
                  background: linear-gradient(
                    135deg,
                    #5b21b6,
                    #f97316
                  );
                }

                .block {
                  border-left: 8px solid #f97316;
                }
              `
              : ''
          }

          ${
            template === 'worksheet'
              ? `
                .block,
                .objective {
                  border-radius: 2px;
                  border-style: dashed;
                }

                .block {
                  min-height: 90px;
                }
              `
              : ''
          }

          ${
            template === 'geometry'
              ? `
                .block {
                  border-left: 7px solid #10b981;
                }

                .generated-image img {
                  background: #ecfdf5;
                  padding: 12px;
                }
              `
              : ''
          }

          ${
            template === 'minimal'
              ? `
                header {
                  background: #374151;
                }

                .block,
                .objective {
                  border: 0;
                  border-bottom: 1px solid #d1d5db;
                  border-radius: 0;
                  background: transparent;
                }
              `
              : ''
          }

          @media (max-width: 600px) {
            main {
              padding: 12px;
            }
          }
        </style>
      </head>

      <body>
        <header>
          <p>
            ${escape(typeLabel)} · ${escape(template)} template
          </p>

          <h1>
            ${escape(activity.title)}
          </h1>
        </header>

        <main>
          <section class="objective">
            <b>Learning objective</b>
            <p>${escape(activity.objective)}</p>
          </section>

          <section>
            ${md(activity.instructions_markdown)}
          </section>

          ${imageBlocks}

          ${blocks}

          ${choices(activity)}

          <details>
            <summary>
              Show solution and explanation
            </summary>

            ${md(activity.solution_markdown)}
          </details>
        </main>

        <script>
          (() => {
            const button = document.querySelector('#check');

            if (!button) {
              return;
            }

            button.addEventListener('click', () => {
              const fieldset = button.closest('fieldset');
              const selected = fieldset.querySelector(
                'input:checked'
              );

              const result =
                document.querySelector('#result');

              if (!selected) {
                result.textContent =
                  'Select an answer first.';
                return;
              }

              result.textContent =
                selected.value === fieldset.dataset.answer
                  ? 'Correct ✓'
                  : 'Not yet. Review the explanation and try again.';
            });
          })();
        </script>
      </body>
    </html>
  `;
}

export function renderPackageIndex({
  title,
  activities
}) {
  const cards = activities
    .map(
      (activity, index) => `
        <li>
          <a href="activities/${escape(
            activity.activity_id
          )}/index.html">
            ${index + 1}. ${escape(activity.title)}
          </a>

          <span>
            ${escape(activity.activity_type)}
            · Process ${escape(activity.process_sequence)}
          </span>
        </li>
      `
    )
    .join('');

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >
        <title>${escape(title)}</title>

        <style>
          body {
            font-family: Inter, system-ui, sans-serif;
            max-width: 900px;
            margin: auto;
            padding: 30px;
            color: #14213d;
          }

          li {
            display: grid;
            gap: 5px;
            padding: 16px;
            margin: 10px 0;
            border: 1px solid #ddd;
            border-radius: 10px;
          }

          a {
            font-weight: 700;
          }

          span {
            color: #687487;
          }
        </style>
      </head>

      <body>
        <h1>${escape(title)}</h1>
        <p>Approved activities</p>
        <ol>
          ${cards}
        </ol>
      </body>
    </html>
  `;
}