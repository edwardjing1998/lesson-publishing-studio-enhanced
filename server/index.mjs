import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';

import { c, requireConfig } from './config.mjs';
import {
  activityCatalog,
  safeSegment,
  validateActivityRequest
} from './domain.mjs';
import {
  downloadPublished,
  downloadSourceAsset,
  downloadSourceLayout,
  uploadBytes
} from './images.mjs';
import {
  approvedPlan,
  planBundle,
  sql
} from './store.mjs';
import { renderPackageIndex } from './renderer.mjs';
import {
  startWorker,
  tick
} from './worker.mjs';

requireConfig();

const app = express();

app.disable('x-powered-by');

app.get('/healthz', (_request, response) => {
  response.json({
    status: 'UP'
  });
});

app.use((request, response, next) => {
  const username = process.env.APP_USERNAME;
  const password = process.env.APP_PASSWORD;

  if (!username || !password) {
    request.operator = 'local-operator';
    return next();
  }

  const expected = Buffer.from(
    `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  );

  const actual = Buffer.from(
    request.headers.authorization || ''
  );

  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    response.set(
      'WWW-Authenticate',
      'Basic realm="Lesson Publishing Studio"'
    );

    return response
      .status(401)
      .send('Authentication required');
  }

  request.operator = username;
  next();
});

app.use(
  express.json({
    limit: '64kb'
  })
);

app.use((request, response, next) => {
  if (
    ['POST', 'PUT', 'DELETE'].includes(request.method) &&
    !request.is('application/json')
  ) {
    return response.status(415).json({
      error: 'JSON required'
    });
  }

  next();
});

app.get('/api/health', async (request, response) => {
  await sql('SELECT 1');

  response.json({
    status: 'UP',
    operator: request.operator
  });
});

app.get('/api/activity-types', (_request, response) => {
  response.json(activityCatalog());
});

app.get('/api/options', async (_request, response) => {
  const rows = await sql(`
    SELECT DISTINCT
      get_json_object(input_json, '$.book_id') AS book_id,
      get_json_object(input_json, '$.chapter_id') AS chapter_id
    FROM ${c.plans}
    WHERE ${approvedPlan}
    ORDER BY
      book_id,
      chapter_id
  `);

  response.json(rows);
});

app.get('/api/plans', async (request, response) => {
  const bookId = String(request.query.book_id || '');
  const chapterId = String(request.query.chapter_id || '');
  const offset = Number(request.query.offset || 0);

  if (!bookId || !chapterId) {
    return response.status(400).json({
      error: 'book_id and chapter_id are required'
    });
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    return response.status(400).json({
      error: 'offset must be a non-negative integer'
    });
  }

  const rows = await sql(
    `
      SELECT
        plan_id,
        fine_page_id,
        grade,
        language,
        learning_objective,
        get_json_object(input_json, '$.title') AS source_title
      FROM ${c.plans}
      WHERE ${approvedPlan}
        AND get_json_object(input_json, '$.book_id') = :bookId
        AND get_json_object(input_json, '$.chapter_id') = :chapterId
      ORDER BY
        fine_page_id,
        reviewed_at DESC,
        plan_id
      LIMIT 51
      OFFSET ${offset}
    `,
    {
      bookId,
      chapterId
    }
  );

  response.json({
    items: rows.slice(0, 50),
    hasMore: rows.length > 50
  });
});

app.get('/api/plans/:id', async (request, response) => {
  response.json(
    await planBundle(request.params.id)
  );
});

app.get('/api/plans/:id/source-preview', async (request, response) => {
  const bundle = await planBundle(request.params.id);
  const layout = await downloadSourceLayout(bundle.source);
  response.json({
    document_id: bundle.source.document_id,
    title: bundle.source.title,
    markdown: bundle.source.markdown,
    layout: layout?.data || null,
    layout_blob: layout?.name || null,
    figureUrls: (bundle.source.images || []).map((_, index) =>
      `/api/plans/${encodeURIComponent(request.params.id)}/source-assets/${index}`
    )
  });
});

app.get('/api/plans/:id/source-assets/:index', async (request, response) => {
  const bundle = await planBundle(request.params.id);
  const image = await downloadSourceAsset(bundle.source, request.params.index);
  response
    .set('Cache-Control', 'private,no-store')
    .type(image.mime)
    .send(image.bytes);
});

app.get('/api/plans/:id/activities', async (request, response) => {
  const rows = await sql(
    `
      SELECT
        activity_id,
        process_id,
        process_sequence,
        activity_type,
        variant_number,
        title,
        objective,
        generation_status,
        generation_error,
        review_status,
        reviewed_by,
        reviewed_at,
        review_comment,
        html_blob_path,
        created_at
      FROM ${c.activities}
      WHERE plan_id = :planId
      ORDER BY
        process_sequence,
        activity_type,
        variant_number,
        created_at DESC
    `,
    {
      planId: request.params.id
    }
  );

  response.json(rows);
});

app.post('/api/plans/:id/activities', async (request, response) => {
  const bundle = await planBundle(request.params.id);

  const activityRequest = validateActivityRequest(
    request.body,
    new Set(
      bundle.processes.map(
        learningProcess => learningProcess.process_id
      )
    )
  );

  const activityIds = [];

  for (const selection of activityRequest.selections) {
    // Do not name this variable "process".
    // Node.js uses the global process object for process.env.
    const learningProcess = bundle.processes.find(
      item => item.process_id === selection.process_id
    );

    if (!learningProcess) {
      throw new Error(
        `Learning process was not found: ${selection.process_id}`
      );
    }

    for (
      let variantNumber = 1;
      variantNumber <= selection.variants;
      variantNumber += 1
    ) {
      const activityId = randomUUID();

      activityIds.push(activityId);

      await sql(
        `
          INSERT INTO ${c.activities} (
            activity_id,
            plan_id,
            fine_page_id,
            process_id,
            process_sequence,
            activity_type,
            variant_number,
            language,
            additional_instruction,
            generation_status,
            review_status,
            model_endpoint,
            prompt_version,
            renderer_version,
            created_by,
            created_at,
            updated_at
          )
          VALUES (
            :activityId,
            :planId,
            :finePageId,
            :processId,
            :processSequence,
            :activityType,
            :variantNumber,
            :language,
            :additionalInstruction,
            'QUEUED',
            'PENDING',
            :modelEndpoint,
            'activity-v1',
            'activity-html-v1',
            :operator,
            current_timestamp(),
            current_timestamp()
          )
        `,
        {
          activityId,
          planId: request.params.id,
          finePageId: bundle.plan.fine_page_id,
          processId: learningProcess.process_id,
          processSequence: learningProcess.sequence_number,
          activityType: selection.activity_type,
          variantNumber,
          language:
            activityRequest.language ||
            bundle.plan.language,
          additionalInstruction:
            activityRequest.additional_instruction,
          modelEndpoint:
            process.env.AZURE_OPENAI_DEPLOYMENT,
          operator: request.operator
        }
      );
    }
  }

  response.status(202).json({
    activity_ids: activityIds
  });

  void tick();
});

app.get('/api/activities/:id', async (request, response) => {
  const [activity] = await sql(
    `
      SELECT *
      FROM ${c.activities}
      WHERE activity_id = :activityId
      LIMIT 1
    `,
    {
      activityId: request.params.id
    }
  );

  if (!activity) {
    return response.status(404).json({
      error: 'Activity not found'
    });
  }

  response.json(activity);
});

app.get(
  '/api/activities/:id/files/{*filePath}',
  async (request, response) => {
    const [activity] = await sql(
      `
        SELECT
          storage_prefix,
          generation_status
        FROM ${c.activities}
        WHERE activity_id = :activityId
        LIMIT 1
      `,
      {
        activityId: request.params.id
      }
    );

    if (
      !activity ||
      activity.generation_status !== 'SUCCEEDED'
    ) {
      return response.status(404).json({
        error: 'Activity file unavailable'
      });
    }

    const requestedPath = Array.isArray(
      request.params.filePath
    )
      ? request.params.filePath.join('/')
      : String(request.params.filePath || '');

    if (
      !requestedPath ||
      requestedPath.includes('..') ||
      requestedPath.startsWith('/')
    ) {
      return response.status(400).json({
        error: 'Invalid file path'
      });
    }

    const file = await downloadPublished(
      `${activity.storage_prefix}/${requestedPath}`
    );

    response
      .set('Cache-Control', 'private,no-store')
      .type(file.mime)
      .send(file.bytes);
  }
);

app.put('/api/activities/:id/review', async (request, response) => {
  const decision = String(
    request.body.decision || ''
  ).toUpperCase();

  const comment = String(
    request.body.comment || ''
  )
    .trim()
    .slice(0, 4000);

  if (
    ![
      'APPROVED',
      'REJECTED',
      'NEEDS_CHANGES'
    ].includes(decision)
  ) {
    return response.status(400).json({
      error: 'Invalid decision'
    });
  }

  const [activity] = await sql(
    `
      SELECT *
      FROM ${c.activities}
      WHERE activity_id = :activityId
        AND generation_status = 'SUCCEEDED'
      LIMIT 1
    `,
    {
      activityId: request.params.id
    }
  );

  if (!activity) {
    return response.status(409).json({
      error:
        'Only successfully generated activities can be reviewed'
    });
  }

  await sql(
    `
      UPDATE ${c.activities}
      SET
        review_status = :decision,
        reviewed_by = :operator,
        reviewed_at = current_timestamp(),
        review_comment = :comment,
        updated_at = current_timestamp()
      WHERE activity_id = :activityId
    `,
    {
      decision,
      operator: request.operator,
      comment,
      activityId: request.params.id
    }
  );

  response.json({
    activity_id: request.params.id,
    review_status: decision
  });
});

app.get('/api/plans/:id/packages', async (request, response) => {
  const rows = await sql(
    `
      SELECT
        package_id,
        version_number,
        generation_status,
        review_status,
        lesson_title,
        index_html_blob_path,
        created_at
      FROM ${c.packages}
      WHERE plan_id = :planId
      ORDER BY version_number DESC
    `,
    {
      planId: request.params.id
    }
  );

  response.json(rows);
});

app.post('/api/plans/:id/packages', async (request, response) => {
  const bundle = await planBundle(request.params.id);

  const activities = await sql(
    `
      SELECT *
      FROM ${c.activities}
      WHERE plan_id = :planId
        AND generation_status = 'SUCCEEDED'
        AND review_status = 'APPROVED'
      ORDER BY
        process_sequence,
        activity_type,
        variant_number
    `,
    {
      planId: request.params.id
    }
  );

  if (!activities.length) {
    return response.status(409).json({
      error:
        'Approve at least one activity before publishing a formal package'
    });
  }

  const missingProcesses = bundle.processes.filter(
    learningProcess =>
      !activities.some(
        activity =>
          activity.process_id ===
          learningProcess.process_id
      )
  );

  if (missingProcesses.length) {
    return response.status(409).json({
      error:
        'Every process requires an approved activity. Missing: ' +
        missingProcesses
          .map(item => item.process_id)
          .join(', ')
    });
  }

  const packageId = randomUUID();

  const [versionResult] = await sql(
    `
      SELECT
        coalesce(max(version_number), 0) + 1
          AS next_version
      FROM ${c.packages}
      WHERE plan_id = :planId
    `,
    {
      planId: request.params.id
    }
  );

  const storagePrefix = [
    c.publishedPrefix,
    'packages',
    safeSegment(bundle.source.book_id, 'book'),
    safeSegment(bundle.source.chapter_id, 'chapter'),
    safeSegment(request.params.id, 'plan'),
    safeSegment(packageId, 'package')
  ].join('/');

  const packagedActivities = [];

  for (const activity of activities) {
    const activityHtml = await downloadPublished(
      activity.html_blob_path
    );

    const targetHtmlPath =
      `${storagePrefix}/activities/` +
      `${activity.activity_id}/index.html`;

    await uploadBytes(
      targetHtmlPath,
      activityHtml.bytes,
      activityHtml.mime
    );

    const activityAssets = await sql(
      `
        SELECT *
        FROM ${c.activityAssets}
        WHERE activity_id = :activityId
      `,
      {
        activityId: activity.activity_id
      }
    );

    for (const asset of activityAssets) {
      const assetFile = await downloadPublished(
        asset.published_blob_path
      );

      const targetAssetPath =
        `${storagePrefix}/activities/` +
        `${activity.activity_id}/assets/` +
        `${asset.file_name}`;

      await uploadBytes(
        targetAssetPath,
        assetFile.bytes,
        assetFile.mime
      );
    }

    packagedActivities.push(activity);
  }

  const lessonTitle =
    `${bundle.source.title} — approved activities`;

  const packageHtml = renderPackageIndex({
    title: lessonTitle,
    activities: packagedActivities
  });

  const savedIndex = await uploadBytes(
    `${storagePrefix}/index.html`,
    Buffer.from(packageHtml),
    'text/html; charset=utf-8'
  );

  const packageManifest = {
    activity_ids: activities.map(
      activity => activity.activity_id
    )
  };

  await sql(
    `
      INSERT INTO ${c.packages} (
        package_id,
        plan_id,
        fine_page_id,
        version_number,
        generation_status,
        review_status,
        generation_profile,
        lesson_title,
        lesson_json,
        storage_prefix,
        index_html_blob_path,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        :packageId,
        :planId,
        :finePageId,
        :versionNumber,
        'SUCCEEDED',
        'APPROVED',
        'APPROVED_ACTIVITIES_ONLY',
        :lessonTitle,
        :manifest,
        :storagePrefix,
        :indexHtmlBlobPath,
        :operator,
        current_timestamp(),
        current_timestamp()
      )
    `,
    {
      packageId,
      planId: request.params.id,
      finePageId: bundle.plan.fine_page_id,
      versionNumber: versionResult.next_version,
      lessonTitle,
      manifest: JSON.stringify(packageManifest),
      storagePrefix,
      indexHtmlBlobPath: savedIndex.name,
      operator: request.operator
    }
  );

  response.status(201).json({
    package_id: packageId,
    index_html_blob_path: savedIndex.name
  });
});

app.get(
  '/api/packages/:id/files/{*filePath}',
  async (request, response) => {
    const [lessonPackage] = await sql(
      `
        SELECT storage_prefix
        FROM ${c.packages}
        WHERE package_id = :packageId
          AND generation_status = 'SUCCEEDED'
        LIMIT 1
      `,
      {
        packageId: request.params.id
      }
    );

    if (!lessonPackage) {
      return response.status(404).json({
        error: 'Package unavailable'
      });
    }

    const requestedPath = Array.isArray(
      request.params.filePath
    )
      ? request.params.filePath.join('/')
      : String(request.params.filePath || '');

    if (
      !requestedPath ||
      requestedPath.includes('..') ||
      requestedPath.startsWith('/')
    ) {
      return response.status(400).json({
        error: 'Invalid path'
      });
    }

    const file = await downloadPublished(
      `${lessonPackage.storage_prefix}/${requestedPath}`
    );

    response
      .set('Cache-Control', 'private,no-store')
      .type(file.mime)
      .send(file.bytes);
  }
);

app.use('/api', (_request, response) => {
  response.status(404).json({
    error: 'API endpoint not found'
  });
});

const distributionDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../dist'
);

app.use(express.static(distributionDirectory));

app.get('/{*path}', (_request, response) => {
  response.sendFile(
    path.join(distributionDirectory, 'index.html')
  );
});

app.use((error, _request, response, next) => {
  console.error(error);

  if (response.headersSent) {
    return next(error);
  }

  response.status(500).json({
    error:
      error.message ||
      'Unexpected server error'
  });
});

await startWorker();

const serverPort = Number(
  process.env.SERVER_PORT || 8083
);

const serverHost =
  process.env.NODE_ENV === 'production'
    ? '0.0.0.0'
    : '127.0.0.1';

app.listen(serverPort, serverHost, () => {
  console.log(
    `Lesson Publishing Studio backend ready on ${serverHost}:${serverPort}`
  );
});
