-- Replace APPLICATION_ID with the Databricks service-principal application ID.
GRANT USE CATALOG ON CATALOG education_rag TO `APPLICATION_ID`;
GRANT USE SCHEMA ON SCHEMA education_rag.silver TO `APPLICATION_ID`;
GRANT USE SCHEMA ON SCHEMA education_rag.gold TO `APPLICATION_ID`;
GRANT SELECT ON TABLE education_rag.silver.learning_plans TO `APPLICATION_ID`;
GRANT SELECT ON TABLE education_rag.silver.page_plans TO `APPLICATION_ID`;
GRANT SELECT ON TABLE education_rag.silver.process_prerequisites TO `APPLICATION_ID`;
GRANT SELECT, MODIFY ON TABLE education_rag.gold.lesson_packages TO `APPLICATION_ID`;
GRANT SELECT, MODIFY ON TABLE education_rag.gold.lesson_pages TO `APPLICATION_ID`;
GRANT SELECT, MODIFY ON TABLE education_rag.gold.lesson_assets TO `APPLICATION_ID`;
GRANT SELECT, MODIFY ON TABLE education_rag.gold.lesson_activities TO `APPLICATION_ID`;
GRANT SELECT, MODIFY ON TABLE education_rag.gold.lesson_activity_assets TO `APPLICATION_ID`;
