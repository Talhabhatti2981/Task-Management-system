const PRODUCTION_APP_URL = "https://task-management-system-4xj4.vercel.app";

const withHttps = (value: string) => {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const isLocalHost = (value: string) =>
  /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value);

export const getAppUrl = () => {
  const configured = withHttps(
    process.env.APP_URL ||
      process.env.SITE_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      ""
  );
  if (configured && !isLocalHost(configured)) return configured;

  const vercelUrl = withHttps(process.env.VERCEL_URL || "");
  if (vercelUrl && !isLocalHost(vercelUrl)) return vercelUrl;

  return PRODUCTION_APP_URL;
};

export const getInviteRedirectUrl = () => `${getAppUrl()}/`;
