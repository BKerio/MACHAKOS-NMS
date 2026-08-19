-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER', 'DRIVER', 'EMT', 'NURSE', 'PARTNER');

-- CreateEnum
CREATE TYPE "AgencyType" AS ENUM ('INTERNAL', 'PARTNER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'DISPATCH_HANDLING', 'DISPATCH_ON_HOLD', 'DISPATCHED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EN_ROUTE', 'AT_SCENE', 'PATIENT_PICKED', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('READY', 'BUSY', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED');

-- CreateTable
CREATE TABLE "agencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AgencyType" NOT NULL DEFAULT 'INTERNAL',
    "location" TEXT,
    "contact_info" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL,
    "fcm_token" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "agency_id" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "case_seq" SERIAL NOT NULL,
    "case_number" TEXT NOT NULL,
    "client_ref" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DRAFT',
    "chief_complaint" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "sub_county" TEXT NOT NULL,
    "sub_county_source" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "alert_mode" TEXT,
    "alert_at" TIMESTAMP(3),
    "notifier_details" JSONB,
    "patient_name" TEXT,
    "patient_age" TEXT,
    "patient_gender" TEXT,
    "patient_nhif" TEXT,
    "patient_national_id" TEXT,
    "patient_contact" TEXT,
    "next_of_kin" TEXT,
    "mass_casualty" BOOLEAN NOT NULL DEFAULT false,
    "mass_casualty_count" INTEGER,
    "watcher_comments" TEXT,
    "dispatcher_comments" TEXT,
    "dispatcher_challenges" TEXT,
    "pre_hospital_management" TEXT,
    "hospital_level_required" INTEGER,
    "alert_nature" TEXT,
    "alert_nature_detail" TEXT,
    "origin_of_alert" TEXT,
    "next_of_kin_phone" TEXT,
    "place_of_referral" TEXT,
    "ambulance_used" TEXT,
    "surveillance_note" TEXT,
    "healthcare_worker_name" TEXT,
    "healthcare_worker_contact" TEXT,
    "maternity_vitals" JSONB,
    "vitals" JSONB,
    "is_gbv_case" BOOLEAN NOT NULL DEFAULT false,
    "partner_notes" TEXT,
    "pcr_url" TEXT,
    "closure_reason" TEXT,
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "watcher_id" TEXT NOT NULL,
    "dispatcher_id" TEXT,
    "assigned_agency_id" TEXT NOT NULL,
    "target_facility_id" TEXT,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "scene_arrival_at" TIMESTAMP(3),
    "patient_pick_at" TIMESTAMP(3),
    "facility_arrival_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "start_lat" DOUBLE PRECISION,
    "start_lng" DOUBLE PRECISION,
    "end_lat" DOUBLE PRECISION,
    "end_lng" DOUBLE PRECISION,
    "handover_vitals" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "incident_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "emt_id" TEXT,
    "nurse_id" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_stops" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facility_id" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "note" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "arrived_at" TIMESTAMP(3),
    "added_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standby_deployments" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standby_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_ambulances" (
    "id" TEXT NOT NULL,
    "agency_id" TEXT,
    "registration_number" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "base_location" TEXT,
    "capacity" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_ambulances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_care_reports" (
    "id" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "task_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,

    CONSTRAINT "patient_care_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'READY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_lat" DOUBLE PRECISION,
    "last_lng" DOUBLE PRECISION,
    "last_location_at" TIMESTAMP(3),
    "last_location_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "agency_id" TEXT NOT NULL,
    "current_driver_id" TEXT,
    "current_emt_id" TEXT,
    "current_nurse_id" TEXT,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "location_name" TEXT,
    "selfie_path" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicle_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "keph_level" INTEGER NOT NULL,
    "sub_county" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'INBOUND',
    "call_from" TEXT NOT NULL,
    "call_to" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "talk_duration" INTEGER NOT NULL DEFAULT 0,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "recording" TEXT,
    "trunk_name" TEXT,
    "did_number" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incident_id" TEXT,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forwarding_logs" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incident_id" TEXT NOT NULL,
    "from_agency_id" TEXT NOT NULL,
    "to_agency_id" TEXT NOT NULL,

    CONSTRAINT "forwarding_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_nature_options" (
    "id" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "detail" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_nature_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gbv_reports" (
    "id" TEXT NOT NULL,
    "survivor_residence" TEXT,
    "has_disability" BOOLEAN,
    "gbv_types" TEXT[],
    "violation_location" TEXT,
    "referred_for" TEXT[],
    "referral_facility" TEXT,
    "first_disclosed_to" TEXT,
    "challenges" TEXT,
    "recommendations" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "incident_id" TEXT NOT NULL,

    CONSTRAINT "gbv_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'SMS',
    "category" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "provider_message_id" TEXT,
    "error" TEXT,
    "group_label" TEXT,
    "incident_id" TEXT,
    "sent_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_case_seq_key" ON "incidents"("case_seq");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_case_number_key" ON "incidents"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_client_ref_key" ON "incidents"("client_ref");

-- CreateIndex
CREATE INDEX "task_stops_task_id_idx" ON "task_stops"("task_id");

-- CreateIndex
CREATE INDEX "standby_deployments_vehicle_id_idx" ON "standby_deployments"("vehicle_id");

-- CreateIndex
CREATE INDEX "standby_deployments_started_at_idx" ON "standby_deployments"("started_at");

-- CreateIndex
CREATE INDEX "partner_ambulances_agency_id_idx" ON "partner_ambulances"("agency_id");

-- CreateIndex
CREATE INDEX "patient_care_reports_task_id_idx" ON "patient_care_reports"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registration_number_key" ON "vehicles"("registration_number");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_imei_key" ON "vehicles"("imei");

-- CreateIndex
CREATE INDEX "check_ins_vehicle_id_idx" ON "check_ins"("vehicle_id");

-- CreateIndex
CREATE INDEX "check_ins_user_id_idx" ON "check_ins"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_logs_call_id_key" ON "call_logs"("call_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_nature_options_nature_detail_key" ON "incident_nature_options"("nature", "detail");

-- CreateIndex
CREATE UNIQUE INDEX "gbv_reports_incident_id_key" ON "gbv_reports"("incident_id");

-- CreateIndex
CREATE INDEX "sms_messages_created_at_idx" ON "sms_messages"("created_at");

-- CreateIndex
CREATE INDEX "sms_messages_incident_id_idx" ON "sms_messages"("incident_id");

-- CreateIndex
CREATE INDEX "sms_messages_category_idx" ON "sms_messages"("category");

-- CreateIndex
CREATE INDEX "sms_contacts_group_idx" ON "sms_contacts"("group");

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_key_key" ON "sms_templates"("key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_watcher_id_fkey" FOREIGN KEY ("watcher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_dispatcher_id_fkey" FOREIGN KEY ("dispatcher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_agency_id_fkey" FOREIGN KEY ("assigned_agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_target_facility_id_fkey" FOREIGN KEY ("target_facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_emt_id_fkey" FOREIGN KEY ("emt_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_nurse_id_fkey" FOREIGN KEY ("nurse_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_stops" ADD CONSTRAINT "task_stops_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standby_deployments" ADD CONSTRAINT "standby_deployments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_ambulances" ADD CONSTRAINT "partner_ambulances_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_care_reports" ADD CONSTRAINT "patient_care_reports_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_care_reports" ADD CONSTRAINT "patient_care_reports_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_driver_id_fkey" FOREIGN KEY ("current_driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_emt_id_fkey" FOREIGN KEY ("current_emt_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_nurse_id_fkey" FOREIGN KEY ("current_nurse_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forwarding_logs" ADD CONSTRAINT "forwarding_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forwarding_logs" ADD CONSTRAINT "forwarding_logs_from_agency_id_fkey" FOREIGN KEY ("from_agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forwarding_logs" ADD CONSTRAINT "forwarding_logs_to_agency_id_fkey" FOREIGN KEY ("to_agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gbv_reports" ADD CONSTRAINT "gbv_reports_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
