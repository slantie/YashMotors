CREATE TYPE "public"."customer_arrival_status" AS ENUM('walk_in', 'pickup', 'customer_waiting', 'breakdown');
CREATE TYPE "public"."service_type" AS ENUM('service', 'repair');
CREATE TYPE "public"."service_sub_type" AS ENUM('major', 'minor', 'breakdown', 'running');
ALTER TABLE "cases" ADD COLUMN "customer_arrival_status" "customer_arrival_status";
ALTER TABLE "cases" ADD COLUMN "service_type" "service_type";
ALTER TABLE "cases" ADD COLUMN "service_sub_type" "service_sub_type";
