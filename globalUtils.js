const getAccountId = () => {
  const accountId = window.location.hostname
    .split(".")[0]
    .replace(/-/g, "_")
    .toUpperCase();
  return accountId;
};

const getCSRFToken = () => document.querySelector('input[name="_csrf"]')?.value;

window.getNetsiteParams = () => {
  return {
    accountId: getAccountId(),
    csrfToken: getCSRFToken()
  };
};
