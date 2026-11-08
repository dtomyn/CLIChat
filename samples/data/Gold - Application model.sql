-- Gold layer star schema for reporting (synthetic).

CREATE TABLE gold.dim_client (
  client_key      BIGINT      NOT NULL, -- Surrogate key
  client_id       VARCHAR(10) NOT NULL, -- Business key from Silver
  province_code   CHAR(2),
  language_code   CHAR(2),
  CONSTRAINT pk_dim_client PRIMARY KEY (client_key)
);

CREATE TABLE gold.fact_application (
  application_key  BIGINT        NOT NULL, -- Surrogate key
  application_id   VARCHAR(9)    NOT NULL, -- Business key from Silver
  client_key       BIGINT        NOT NULL REFERENCES gold.dim_client (client_key),
  application_type VARCHAR(10)   NOT NULL,
  submitted_date   DATE          NOT NULL,
  status_code      VARCHAR(12)   NOT NULL,
  channel_code     VARCHAR(10),
  fee_amount       DECIMAL(10,2) NOT NULL,
  CONSTRAINT pk_fact_application PRIMARY KEY (application_key)
);
