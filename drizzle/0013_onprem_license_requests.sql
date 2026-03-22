-- Create license request status enum
CREATE TYPE license_request_status AS ENUM ('pending', 'completed', 'cancelled');

-- Create onprem_license_requests table
CREATE TABLE onprem_license_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no SERIAL NOT NULL,
  deployment_id UUID NOT NULL REFERENCES onprem_deployments(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  status license_request_status NOT NULL DEFAULT 'pending',
  license_start_date TIMESTAMP NOT NULL,
  license_end_date TIMESTAMP NOT NULL,
  number_of_projects INTEGER NOT NULL,
  notes TEXT,
  file_name VARCHAR(255),
  file_path TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMP,
  cancelled_by UUID REFERENCES users(id),
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Restart request_no sequence from 1000
ALTER SEQUENCE onprem_license_requests_request_no_seq RESTART WITH 1000;

-- Create indices for common queries
CREATE INDEX idx_onprem_license_requests_deployment_id ON onprem_license_requests(deployment_id);
CREATE INDEX idx_onprem_license_requests_requested_by ON onprem_license_requests(requested_by);
CREATE INDEX idx_onprem_license_requests_status ON onprem_license_requests(status);
CREATE INDEX idx_onprem_license_requests_created_at ON onprem_license_requests(created_at);
