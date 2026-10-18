import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const THANKS_URL = "https://example.com/thanks";

/** Signs in as the test owner (e2e/worker.ts) and opens the forms list. */
async function signIn(page: Page, next = "/app/") {
  await page.goto(`/__e2e/login?next=${encodeURIComponent(next)}`);
}

/** Creates a form from a website template, the way a new owner would. */
async function formFromTemplate(page: Page, slug: string) {
  await page.goto(`/templates/${slug}/`);
  await page.getByRole("link", { name: "Use this template" }).first().click();
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/app\/forms\/frm_/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

async function publish(page: Page) {
  await page.getByRole("tab", { name: "Publish" }).click();
  await page.getByRole("button", { name: /^Publish (form|changes)$/ }).click();
  await expect(page.getByText("Live · up to date")).toBeVisible();
  const url = await page.getByLabel("Public link").inputValue();
  const sheet = await page.getByRole("link", { name: "Open sheet" }).getAttribute("href");
  const spreadsheetId = /\/d\/([^/]+)/.exec(sheet ?? "")?.[1];
  if (!spreadsheetId) throw new Error(`No spreadsheet link: ${String(sheet)}`);
  return { url, spreadsheetId };
}

/** Rows in the fake Google sheet, header first. */
async function rows(request: APIRequestContext, spreadsheetId: string): Promise<string[][]> {
  const res = await request.get(`/__e2e/sheets/${spreadsheetId}`);
  return (await res.json()) as string[][];
}

/** The Turnstile test key always passes, but the token still arrives asynchronously. */
async function waitForTurnstile(scope: Page | ReturnType<Page["frameLocator"]>) {
  await expect(scope.locator("[name='cf-turnstile-response']")).not.toHaveValue("", {
    timeout: 20_000,
  });
}

test("owner publishes a template; a respondent's answers reach the sheet with UTM tags", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await formFromTemplate(page, "contact-form");
  await page.getByRole("button", { name: /UTM tracking/ }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);
  const header = (await rows(request, spreadsheetId))[0];
  expect(header).toEqual(expect.arrayContaining(["_submission_id", "Name", "Email", "UTM source"]));

  // The respondent has no session: a separate browser context.
  const respondent = await (await browser.newContext()).newPage();
  await respondent.goto(`${url}?utm_source=e2e&utm_campaign=launch&fld_name=Ada%20Lovelace`);
  await expect(respondent.getByLabel("Name")).toHaveValue("Ada Lovelace");

  // Checked in the browser before anything is sent.
  await respondent.getByLabel("Email").fill("not-an-email");
  await respondent.getByRole("button", { name: "Send message" }).click();
  await expect(respondent.getByText("Please correct the highlighted fields.")).toBeVisible();
  await expect(respondent.getByText("Enter a valid email address.")).toBeVisible();
  await expect(respondent.getByLabel("Email")).toBeFocused();

  await respondent.getByLabel("Email").fill("ada@example.com");
  await expect(respondent.getByText("Enter a valid email address.")).toBeHidden();
  await respondent.getByLabel("Message").fill("Hello from the end-to-end test.");
  await waitForTurnstile(respondent);
  await respondent.getByRole("button", { name: "Send message" }).click();
  await expect(respondent.getByText(/thanks/i)).toBeVisible();

  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  const [head, row] = await rows(request, spreadsheetId);
  const value = (column: string) => row?.[head?.indexOf(column) ?? -1];
  expect(value("Name")).toBe("Ada Lovelace");
  expect(value("Email")).toBe("ada@example.com");
  expect(value("UTM source")).toBe("e2e");
  expect(value("UTM campaign")).toBe("launch");

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("1 response delivered in the last 30 days")).toBeVisible();
});

test("an embedded form reads UTM tags from the host page and sends the whole page on", async ({
  page,
  request,
  baseURL,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Newsletter");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "+ Email", exact: true }).click();
  await page.getByRole("button", { name: /UTM tracking/ }).click();
  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByRole("button", { name: "Go to a web page" }).click();
  await page.getByLabel("Web page address").fill(THANKS_URL);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);

  // An owner's site on another origin (127.0.0.1; the forms are on localhost) with the embed code
  // from the Publish tab.
  const embedCode = await page.getByLabel("Embed code").inputValue();
  expect(embedCode).toContain(url);
  await page.route(`${THANKS_URL}*`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Thanks</title><p>Owner thanks page" }),
  );
  const ownerSite = new URL("/__e2e/owner-site", String(baseURL));
  ownerSite.hostname = "127.0.0.1";
  ownerSite.search = new URLSearchParams({
    code: embedCode,
    utm_source: "host-page",
    utm_medium: "email",
  }).toString();
  await page.goto(ownerSite.href);

  const form = page.frameLocator("iframe[data-freelyforms]");
  await expect(form.locator("input[data-param=utm_source]")).toHaveValue("host-page");
  await expect(form.locator("input[data-param=utm_medium]")).toHaveValue("email");
  // The frame takes the form's height (the embed code starts it at 600px).
  await expect
    .poll(() => page.locator("iframe[data-freelyforms]").evaluate((f) => f.clientHeight))
    .not.toBe(600);

  await form.getByLabel("Email").fill("reader@example.com");
  await waitForTurnstile(form);
  await form.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(THANKS_URL);

  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  const [head, row] = await rows(request, spreadsheetId);
  expect(row?.[head?.indexOf("UTM source") ?? -1]).toBe("host-page");
});

test("a published form works at phone width in dark mode @phone", async ({ page, browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner);
  await formFromTemplate(owner, "event-registration-form");
  const { url } = await publish(owner);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(url);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(255, 255, 255)");

  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("Please correct the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeFocused();
});
