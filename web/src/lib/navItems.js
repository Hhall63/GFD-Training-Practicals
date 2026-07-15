export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Tests", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Batch Grade", "/batch-grade"],
    ["Manage Exams", "/exams"],
    ["Enter Exam Scores", "/exam-scores"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
