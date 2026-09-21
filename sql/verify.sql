SELECT generation_status,review_status,count(*) AS packages
FROM education_rag.gold.lesson_packages
GROUP BY generation_status,review_status;

SELECT package_id,plan_id,version_number,lesson_title,index_html_blob_path,created_at
FROM education_rag.gold.lesson_packages
ORDER BY created_at DESC;

SELECT package_id,count(*) AS process_pages
FROM education_rag.gold.lesson_pages
GROUP BY package_id;

SELECT package_id,count(*) AS assets
FROM education_rag.gold.lesson_assets
GROUP BY package_id;

SELECT activity_type,generation_status,review_status,count(*) AS activities
FROM education_rag.gold.lesson_activities
GROUP BY activity_type,generation_status,review_status;

SELECT activity_id,count(*) AS assets
FROM education_rag.gold.lesson_activity_assets
GROUP BY activity_id;
