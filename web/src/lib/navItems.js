export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Tests", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
