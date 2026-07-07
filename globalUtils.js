const getAccountId = () => {
  const accountId = window.location.hostname
    .split(".")[0]
    .replace(/-/g, "_")
    .toUpperCase();
  return accountId;
};

const getNetSuiteApplicationDomain = () => {
  const host = window.location.hostname;
  if (host && host.includes(".app.netsuite.com")) return host;
  return `${getAccountId().toLowerCase().replace(/_/g, "-")}.app.netsuite.com`;
};

const getCSRFToken = () => document.querySelector('input[name="_csrf"]')?.value;

window.getNetsiteParams = () => {
  return {
    accountId: getAccountId(),
    domain: getNetSuiteApplicationDomain(),
    csrfToken: getCSRFToken()
  };
};

window.getNetSuiteApplicationDomain = getNetSuiteApplicationDomain;
