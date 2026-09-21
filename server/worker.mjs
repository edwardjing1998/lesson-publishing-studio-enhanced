import { randomUUID } from 'node:crypto';
import { c } from './config.mjs';
import {
  ACTIVITY_TYPES,
  hash,
  safeSegment
} from './domain.mjs';
import {
  downloadSourceImages,
  uploadBytes
} from './images.mjs';
import { generateActivity } from './model.mjs';
import { renderActivity } from './renderer.mjs';
import { generateActivitySvg } from './svg-generator.mjs';
import {
  planBundle,
  sql
} from './store.mjs';

let busy = false;

async function status(id, value, error = '') {
  await sql(
    `
      UPDATE ${c.activities}
      SET generation_status = :value,
          generation_error = :error,
          updated_at = current_timestamp()
      WHERE activity_id = :id
    `,
    {
      id,
      value,
      error
    }
  );
}

async function run(job) {
  await status(job.activity_id, 'RUNNING');

  try {
    const bundle = await planBundle(job.plan_id);

    const learningProcess = bundle.processes.find(
      item => item.process_id === job.process_id
    );

    if (!learningProcess) {
      throw new Error('Approved process no longer exists');
    }

    const images = await downloadSourceImages(bundle.source);

    const input = {
      plan: bundle.plan,
      source: bundle.source,
      process: learningProcess,
      images,
      activityType: job.activity_type,
      variantNumber: Number(job.variant_number),
      language: job.language,
      additionalInstruction: job.additional_instruction
    };

    const inputHash = hash(
      JSON.stringify({
        plan: bundle.plan.plan_id,
        source: bundle.source,
        process: learningProcess,
        activityType: job.activity_type,
        variant: job.variant_number,
        imageHashes: images.map(
          image => image.ref.content_hash
        ),
        prompt: 'activity-v1'
      })
    );

    const { raw, value } = await generateActivity(input);

    await sql(
      `
        UPDATE ${c.activities}
        SET input_hash = :inputHash,
            raw_model_result = :raw
        WHERE activity_id = :id
      `,
      {
        inputHash,
        raw,
        id: job.activity_id
      }
    );

    if (value.status === 'NEEDS_SOURCE_REVIEW') {
      await status(
        job.activity_id,
        'NEEDS_SOURCE_REVIEW',
        value.reason
      );
      return;
    }

    const prefix = [
      c.publishedPrefix,
      'activities',
      safeSegment(bundle.source.book_id, 'book'),
      safeSegment(bundle.source.chapter_id, 'chapter'),
      safeSegment(job.plan_id, 'plan'),
      safeSegment(job.process_id, 'process'),
      safeSegment(job.activity_id, 'activity')
    ].join('/');

    const assetNames = {};

    /*
     * Upload source images selected by the model.
     */
    for (
      const image of images.filter(
        item => value.image_ids.includes(item.id)
      )
    ) {
      const fileName = `${image.id}.${image.extension}`;

      assetNames[image.id] = fileName;

      const saved = await uploadBytes(
        `${prefix}/assets/${fileName}`,
        image.bytes,
        image.mime
      );

      await sql(
        `
          INSERT INTO ${c.activityAssets} (
            asset_id,
            activity_id,
            source_blob_path,
            published_blob_path,
            file_name,
            content_type,
            content_hash,
            file_size,
            created_at
          )
          VALUES (
            :assetId,
            :activityId,
            :source,
            :published,
            :fileName,
            :mime,
            :hash,
            :size,
            current_timestamp()
          )
        `,
        {
          assetId: randomUUID(),
          activityId: job.activity_id,
          source: image.ref.blob_path,
          published: saved.name,
          fileName,
          mime: saved.mime,
          hash: saved.hash,
          size: saved.size
        }
      );
    }

    /*
     * Generate and upload SVG images requested by the AI model.
     */
    const generatedAssets = {};

    for (const imageRequest of value.image_requests || []) {
      const fileName = `${safeSegment(
        imageRequest.image_id,
        'image'
      )}.svg`;

      const svg = await generateActivitySvg({
        request: imageRequest,
        activity: value,
        template: process.env.HTML_TEMPLATE || 'classroom'
      });

      const saved = await uploadBytes(
        `${prefix}/assets/${fileName}`,
        Buffer.from(svg, 'utf8'),
        'image/svg+xml'
      );

      generatedAssets[imageRequest.image_id] = fileName;

      await sql(
        `
          INSERT INTO ${c.activityAssets} (
            asset_id,
            activity_id,
            source_blob_path,
            published_blob_path,
            file_name,
            content_type,
            content_hash,
            file_size,
            created_at
          )
          VALUES (
            :assetId,
            :activityId,
            :source,
            :published,
            :fileName,
            :mime,
            :hash,
            :size,
            current_timestamp()
          )
        `,
        {
          assetId: randomUUID(),
          activityId: job.activity_id,
          source: null,
          published: saved.name,
          fileName,
          mime: saved.mime,
          hash: saved.hash,
          size: saved.size
        }
      );
    }

    /*
     * Render HTML using both source images and generated SVG assets.
     */
    const html = renderActivity({
      activity: value,
      assetNames: {
        ...assetNames,
        ...generatedAssets
      },
      typeLabel: ACTIVITY_TYPES[job.activity_type].label
    });

    const htmlSaved = await uploadBytes(
      `${prefix}/index.html`,
      Buffer.from(html, 'utf8'),
      'text/html; charset=utf-8'
    );

    const jsonSaved = await uploadBytes(
      `${prefix}/activity.json`,
      Buffer.from(
        JSON.stringify(value, null, 2),
        'utf8'
      ),
      'application/json; charset=utf-8'
    );

    await sql(
      `
        UPDATE ${c.activities}
        SET generation_status = 'SUCCEEDED',
            title = :title,
            objective = :objective,
            activity_json = :json,
            storage_prefix = :prefix,
            html_blob_path = :html,
            json_blob_path = :jsonPath,
            content_hash = :hash,
            updated_at = current_timestamp()
        WHERE activity_id = :id
      `,
      {
        title: value.title,
        objective: value.objective,
        json: JSON.stringify(value),
        prefix,
        html: htmlSaved.name,
        jsonPath: jsonSaved.name,
        hash: hash(JSON.stringify(value)),
        id: job.activity_id
      }
    );
  } catch (error) {
    await status(
      job.activity_id,
      'FAILED',
      String(error.message || error).slice(0, 2000)
    );
  }
}

export async function tick() {
  if (busy) {
    return;
  }

  busy = true;

  try {
    const [job] = await sql(
      `
        SELECT *
        FROM ${c.activities}
        WHERE generation_status = 'QUEUED'
        ORDER BY created_at
        LIMIT 1
      `
    );

    if (job) {
      await run(job);
    }
  } catch (error) {
    console.error('Worker:', error.message);
  } finally {
    busy = false;
  }
}

export async function startWorker() {
  await sql(
    `
      UPDATE ${c.activities}
      SET generation_status = 'FAILED',
          generation_error =
            'Backend restarted during generation; create another activity',
          updated_at = current_timestamp()
      WHERE generation_status = 'RUNNING'
    `
  );

  setInterval(tick, 10000);

  void tick();
}
