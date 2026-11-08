-- Source system extract tables (synthetic), landed as-is in the Bronze layer.

CREATE TABLE src.CLIENTS (
  CLIENT_ID     VARCHAR(10)  NOT NULL PRIMARY KEY, -- Client number, C-9999
  FIRST_NM      VARCHAR(60)  NOT NULL,             -- Given name
  LAST_NM       VARCHAR(60)  NOT NULL,             -- Family name
  BIRTH_DT      DATE,                              -- Date of birth
  PROVINCE_CD   CHAR(2),                           -- Province or territory of residence
  PREF_LANG_CD  CHAR(2)                            -- Preferred official language, EN or FR
);

CREATE TABLE src.APPLICATIONS (
  APP_ID            VARCHAR(9)    NOT NULL,        -- Application number, AP9999999
  CLIENT_ID         VARCHAR(10)   NOT NULL REFERENCES src.CLIENTS (CLIENT_ID), -- Applicant
  APP_TYPE          VARCHAR(10)   NOT NULL,        -- NEW, RENEWAL or AMEND
  SUBMIT_DT         DATE          NOT NULL,        -- Date the application was submitted
  STATUS_CD         VARCHAR(12)   NOT NULL,        -- Processing status
  FEE_AMT           DECIMAL(10,2) NOT NULL,        -- Fee paid
  PROVINCE_CD       CHAR(2),                       -- Province of the application
  EMAIL_ADDR        VARCHAR(120),                  -- Contact email
  INTERNAL_NOTE_TXT VARCHAR(500),                  -- Free-text officer note (not migrated)
  LAST_UPD_TS       TIMESTAMP     NOT NULL,        -- Last change in the source system
  CONSTRAINT PK_APPLICATIONS PRIMARY KEY (APP_ID),
  CONSTRAINT CK_APP_TYPE CHECK (APP_TYPE IN ('NEW', 'RENEWAL', 'AMEND'))
);
