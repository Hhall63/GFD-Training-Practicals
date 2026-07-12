#!/usr/bin/env bash
# Seeds a deterministic two-template Test Group fixture in the Firestore emulator, used to
# verify the session-state-leak fix (Task 1/#12) and the Overall-Timer countdown (Task 4/#7).
# Run this AFTER the emulators are up and the verify.admin login + meta/appState doc exist
# (see web/.claude/skills/verify/SKILL.md).
set -euo pipefail
BASE="http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents"
AUTH=(-H "Authorization: Bearer owner" -H "Content-Type: application/json")

curl -s -X PATCH "$BASE/recruits/recruitX" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Casey"},
  "lastName":{"stringValue":"Rivera"},
  "recruitClassOrCohort":{"stringValue":"Recruit Class 42"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

# Template A: Extend the ladder (10pts) -> Secure the base (10pts) -> Overall Timer (20pts, 300s)
curl -s -X PATCH "$BASE/templates/tplA" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise A"},
  "isActive":{"booleanValue":true},
  "status":{"stringValue":"published"},
  "passingPercentage":{"integerValue":"70"}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA0" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"0"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Extend the ladder"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA1" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"1"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Secure the base"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA2" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"2"},"lineType":{"stringValue":"overallTimer"},
  "lineText":{"stringValue":"Overall Timer"},"points":{"integerValue":"20"},
  "passThresholdSeconds":{"integerValue":"300"},"isCritical":{"booleanValue":false}
}}' > /dev/null

# Template B: Climb to the tip (10pts) -> Overall Timer (20pts, 300s)
curl -s -X PATCH "$BASE/templates/tplB" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise B"},
  "isActive":{"booleanValue":true},
  "status":{"stringValue":"published"},
  "passingPercentage":{"integerValue":"70"}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplB/lines/lineB0" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"0"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Climb to the tip"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplB/lines/lineB1" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"1"},"lineType":{"stringValue":"overallTimer"},
  "lineText":{"stringValue":"Overall Timer"},"points":{"integerValue":"20"},
  "passThresholdSeconds":{"integerValue":"300"},"isCritical":{"booleanValue":false}
}}' > /dev/null

curl -s -X PATCH "$BASE/testGroups/groupAB" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise Group"},
  "isActive":{"booleanValue":true},
  "templateIds":{"arrayValue":{"values":[{"stringValue":"tplA"},{"stringValue":"tplB"}]}}
}}' > /dev/null

echo "Fixture seeded: recruitX, tplA (3 lines), tplB (2 lines), testGroups/groupAB"
