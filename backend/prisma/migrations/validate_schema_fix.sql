-- Schema Validation Script
-- Validates the schema fixes are properly applied

-- Check if Case model has the required new fields
DO $$
DECLARE
    column_exists INTEGER;
BEGIN
    -- Check procedure_code column
    SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns 
    WHERE table_schema = 'medical' 
    AND table_name = 'cases' 
    AND column_name = 'procedure_code';
    
    IF column_exists = 0 THEN
        RAISE EXCEPTION 'Missing column: medical.cases.procedure_code';
    END IF;
    
    -- Check procedure_description column
    SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns 
    WHERE table_schema = 'medical' 
    AND table_name = 'cases' 
    AND column_name = 'procedure_description';
    
    IF column_exists = 0 THEN
        RAISE EXCEPTION 'Missing column: medical.cases.procedure_description';
    END IF;
    
    -- Check value column
    SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns 
    WHERE table_schema = 'medical' 
    AND table_name = 'cases' 
    AND column_name = 'value';
    
    IF column_exists = 0 THEN
        RAISE EXCEPTION 'Missing column: medical.cases.value';
    END IF;
    
    -- Check request_date column
    SELECT COUNT(*) INTO column_exists
    FROM information_schema.columns 
    WHERE table_schema = 'medical' 
    AND table_name = 'cases' 
    AND column_name = 'request_date';
    
    IF column_exists = 0 THEN
        RAISE EXCEPTION 'Missing column: medical.cases.request_date';
    END IF;
    
    RAISE NOTICE 'All Case model columns are present';
END
$$;

-- Check if Decision table exists
DO $$
DECLARE
    table_exists INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_exists
    FROM information_schema.tables 
    WHERE table_schema = 'medical' 
    AND table_name = 'decisions';
    
    IF table_exists = 0 THEN
        RAISE EXCEPTION 'Missing table: medical.decisions';
    END IF;
    
    RAISE NOTICE 'Decision table exists';
END
$$;

-- Check if CaseAIAnalysis relation table exists
DO $$
DECLARE
    table_exists INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_exists
    FROM information_schema.tables 
    WHERE table_schema = 'ai' 
    AND table_name = 'case_ai_analyses';
    
    IF table_exists = 0 THEN
        RAISE EXCEPTION 'Missing table: ai.case_ai_analyses';
    END IF;
    
    RAISE NOTICE 'CaseAIAnalysis relation table exists';
END
$$;

-- Check indices are created
DO $$
DECLARE
    index_exists INTEGER;
BEGIN
    -- Check procedure_code index
    SELECT COUNT(*) INTO index_exists
    FROM pg_indexes 
    WHERE schemaname = 'medical' 
    AND tablename = 'cases' 
    AND indexname = 'idx_cases_procedure_code';
    
    IF index_exists = 0 THEN
        RAISE EXCEPTION 'Missing index: idx_cases_procedure_code';
    END IF;
    
    -- Check value index
    SELECT COUNT(*) INTO index_exists
    FROM pg_indexes 
    WHERE schemaname = 'medical' 
    AND tablename = 'cases' 
    AND indexname = 'idx_cases_value';
    
    IF index_exists = 0 THEN
        RAISE EXCEPTION 'Missing index: idx_cases_value';
    END IF;
    
    -- Check request_date index
    SELECT COUNT(*) INTO index_exists
    FROM pg_indexes 
    WHERE schemaname = 'medical' 
    AND tablename = 'cases' 
    AND indexname = 'idx_cases_request_date';
    
    IF index_exists = 0 THEN
        RAISE EXCEPTION 'Missing index: idx_cases_request_date';
    END IF;
    
    RAISE NOTICE 'All required indices are present';
END
$$;

-- Validate data integrity
SELECT 
    COUNT(*) as total_cases,
    COUNT(procedure_code) as cases_with_procedure_code,
    COUNT(value) as cases_with_value,
    COUNT(request_date) as cases_with_request_date
FROM medical.cases;

-- Check for any NULL values that shouldn't be NULL
SELECT 
    'Cases missing critical data' as issue_type,
    COUNT(*) as count
FROM medical.cases 
WHERE procedure_code IS NULL 
   OR value IS NULL 
   OR request_date IS NULL;

RAISE NOTICE 'Schema validation completed successfully';