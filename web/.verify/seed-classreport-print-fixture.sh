#!/usr/bin/env bash
# Seeds two active recruits in the same cohort plus a classReportFilters doc that
# includes both of them (with no templateIds, so each recruit renders its
# "No results yet" empty state — content doesn't matter, only that two
# .class-report-recruit blocks render back to back).
# Run this AFTER the emulators are up and the verify.admin login + meta/appState doc
# exist (see web/.claude/skills/verify/SKILL.md).
set -euo pipefail
BASE="http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents"
AUTH=(-H "Authorization: Bearer owner" -H "Content-Type: application/json")

curl -s -X PATCH "$BASE/recruits/verifyPrintRecruitA" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Alpha"},
  "lastName":{"stringValue":"Anderson"},
  "recruitClassOrCohort":{"stringValue":"Verify Print Cohort"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

curl -s -X PATCH "$BASE/recruits/verifyPrintRecruitB" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Beta"},
  "lastName":{"stringValue":"Baker"},
  "recruitClassOrCohort":{"stringValue":"Verify Print Cohort"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

curl -s -X PATCH "$BASE/classReportFilters/verifyPrintFilter" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Verify Print Fixture"},
  "cohort":{"stringValue":"Verify Print Cohort"},
  "templateIds":{"arrayValue":{"values":[]}},
  "isActive":{"booleanValue":true}
}}' > /dev/null

echo "Fixture seeded: recruits/verifyPrintRecruitA, recruits/verifyPrintRecruitB, classReportFilters/verifyPrintFilter"
