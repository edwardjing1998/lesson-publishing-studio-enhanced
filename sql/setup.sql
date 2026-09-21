CREATE SCHEMA IF NOT EXISTS education_rag.gold;

CREATE TABLE IF NOT EXISTS education_rag.gold.lesson_packages (
  package_id STRING, plan_id STRING, fine_page_id STRING, version_number INT,
  generation_status STRING, review_status STRING, generation_profile STRING,
  generation_options_json STRING, lesson_title STRING, input_hash STRING,
  raw_model_result STRING, lesson_json STRING, model_endpoint STRING,
  prompt_version STRING, renderer_version STRING, storage_prefix STRING,
  index_html_blob_path STRING, lesson_json_blob_path STRING, generation_error STRING,
  created_by STRING, created_at TIMESTAMP, updated_at TIMESTAMP,
  reviewed_by STRING, reviewed_at TIMESTAMP, review_comment STRING
) USING DELTA;

CREATE TABLE IF NOT EXISTS education_rag.gold.lesson_pages (
  lesson_page_id STRING, package_id STRING, plan_id STRING, process_id STRING,
  sequence_number INT, title STRING, lesson_spec_json STRING, html_blob_path STRING,
  content_hash STRING, created_at TIMESTAMP, updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS education_rag.gold.lesson_assets (
  asset_id STRING, package_id STRING, lesson_page_id STRING,
  source_blob_path STRING, published_blob_path STRING, file_name STRING,
  content_type STRING, content_hash STRING, file_size BIGINT, created_at TIMESTAMP
) USING DELTA;

-- One immutable model request and HTML document per process/type/variant.
CREATE TABLE IF NOT EXISTS education_rag.gold.lesson_activities (
  activity_id STRING, plan_id STRING, fine_page_id STRING,
  process_id STRING, process_sequence INT, activity_type STRING,
  variant_number INT, language STRING, additional_instruction STRING,
  generation_status STRING, generation_error STRING,
  title STRING, objective STRING, activity_json STRING,
  input_hash STRING, content_hash STRING, raw_model_result STRING,
  model_endpoint STRING, prompt_version STRING, renderer_version STRING,
  storage_prefix STRING, html_blob_path STRING, json_blob_path STRING,
  review_status STRING, reviewed_by STRING, reviewed_at TIMESTAMP,
  review_comment STRING, created_by STRING, created_at TIMESTAMP, updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS education_rag.gold.lesson_activity_assets (
  asset_id STRING, activity_id STRING, source_blob_path STRING,
  published_blob_path STRING, file_name STRING, content_type STRING,
  content_hash STRING, file_size BIGINT, created_at TIMESTAMP
) USING DELTA;
