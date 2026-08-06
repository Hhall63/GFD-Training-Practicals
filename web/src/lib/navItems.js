export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Practicals", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Batch Grade", "/batch-grade"],
    ["Test Bank", "/exams"],
    ["Written Test Gradebook", "/exam-scores"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
