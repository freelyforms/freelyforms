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

test("an owner copies a form into a new draft with the same fields", async ({ page }) => {
  await signIn(page);
  await formFromTemplate(page, "feedback-form");
  await publish(page);
  const original = page.url();
  await page.getByRole("button", { name: "Make a copy" }).click();
  await expect(page).not.toHaveURL(original);
  await expect(page).toHaveURL(/\/app\/forms\/frm_/);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(/\(copy\)$/);
  await page.getByRole("tab", { name: "Publish" }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  await page.goto("/app/");
  await expect(page.getByRole("link", { name: /\(copy\)/ })).toBeVisible();
});

test("a follow-up question appears only when its condition holds", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Conditional");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "+ Single choice", exact: true }).click();
  await page.getByRole("button", { name: "+ Short text", exact: true }).click();

  // On the second question: show it only if the first is "Option 1", and require it.
  const followUp = page.locator("article").nth(1);
  await followUp.getByRole("button", { name: "+ Show only if…" }).click();
  await expect(followUp.getByLabel("Condition 1: question")).toHaveValue(/fld_/);
  await expect(followUp.getByLabel("Condition 1: test")).toHaveValue("equals");
  await expect(followUp.getByLabel("Condition 1: value").locator("option:checked")).toHaveText(
    "Option 1",
  );
  await followUp.getByLabel("Required").check();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);

  const respondent = await (await browser.newContext()).newPage();
  await respondent.goto(url);
  const question = respondent.getByLabel("Short text");
  await expect(question).toBeHidden();
  await respondent.getByLabel("Option 1").check();
  await expect(question).toBeVisible();

  // Required while shown...
  await waitForTurnstile(respondent);
  await respondent.getByRole("button", { name: "Submit" }).click();
  await expect(respondent.getByText("This field is required.")).toBeVisible();
  await question.fill("typed, then hidden");

  // ...and neither required nor sent once hidden again.
  await respondent.getByLabel("Option 2").check();
  await expect(question).toBeHidden();
  await respondent.getByRole("button", { name: "Submit" }).click();
  await expect(respondent.getByText(/received/i)).toBeVisible();

  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  const [head, row] = await rows(request, spreadsheetId);
  expect(row?.[head?.indexOf("Single choice") ?? -1]).toBe("Option 2");
  expect(row?.[head?.indexOf("Short text") ?? -1] ?? "").toBe("");
});

test("a multi-page form shows one page at a time and skips pages that don't apply", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Multi-page");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  for (const type of ["Single choice", "Page break", "Short text", "Page break", "Email"]) {
    await page.getByRole("button", { name: `+ ${type}`, exact: true }).click();
  }
  const cards = page.locator("article");
  // The middle page applies only to "Option 2"; its question is required.
  await cards.nth(1).getByRole("button", { name: "+ Show only if…" }).click();
  await expect(cards.nth(1).getByText("Show this page only if")).toBeVisible();
  await cards.nth(1).getByLabel("Condition 1: value").selectOption({ label: "Option 2" });
  await cards.nth(2).getByLabel("Required").check();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);
  expect((await rows(request, spreadsheetId))[0]).not.toContain("Next page");

  const r = await (await browser.newContext()).newPage();
  await r.goto(url);
  const progress = r.locator(".progress");
  const next = r.getByRole("button", { name: "Next" });
  const submit = r.getByRole("button", { name: "Submit" });
  await expect(progress).toHaveText("Page 1 of 2");
  await r.getByLabel("Option 2").check();
  await expect(progress).toHaveText("Page 1 of 3");
  await expect(submit).toBeHidden();

  await next.click();
  await expect(progress).toHaveText("Page 2 of 3");
  await expect(r.getByLabel("Option 2")).toBeHidden();
  await next.click();
  await expect(r.getByText("This field is required.")).toBeVisible();
  await expect(r.getByLabel("Short text")).toBeFocused();
  await r.getByLabel("Short text").fill("only for option 2");
  // Enter on a page before the last moves on instead of submitting.
  await r.getByLabel("Short text").press("Enter");
  await expect(progress).toHaveText("Page 3 of 3");
  await expect(submit).toBeVisible();

  await r.getByRole("button", { name: "Back" }).click();
  await expect(r.getByLabel("Short text")).toHaveValue("only for option 2");
  await r.getByRole("button", { name: "Back" }).click();
  await r.getByLabel("Option 1").check();
  await expect(progress).toHaveText("Page 1 of 2");
  await next.click();
  await expect(progress).toHaveText("Page 2 of 2");
  await r.getByLabel("Email").fill("pages@example.com");
  await waitForTurnstile(r);
  await submit.click();
  await expect(r.getByText(/received/i)).toBeVisible();

  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  const [head, row] = await rows(request, spreadsheetId);
  expect(row?.[head?.indexOf("Single choice") ?? -1]).toBe("Option 1");
  expect(row?.[head?.indexOf("Short text") ?? -1] ?? "").toBe("");
  expect(row?.[head?.indexOf("Email") ?? -1]).toBe("pages@example.com");
});

test("a question can be required only when an earlier answer calls for it", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Call me back");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "+ Checkboxes", exact: true }).click();
  await page.getByRole("button", { name: "+ Phone", exact: true }).click();
  const phone = page.locator("article").nth(1);
  await phone.getByRole("button", { name: "+ Required only if…" }).click();
  await expect(phone.getByText("Require an answer only if")).toBeVisible();
  await expect(phone.getByLabel("Condition 1: test")).toHaveValue("contains");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url } = await publish(page);

  const r = await (await browser.newContext()).newPage();
  await r.goto(url);
  const star = r.locator("[data-req-if]");
  await expect(star).toBeHidden();
  await r.getByLabel("Option 1").check();
  await expect(star).toBeVisible();
  await expect(r.getByLabel("Phone")).toHaveAttribute("aria-required", "true");
  await waitForTurnstile(r);
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByText("This field is required.")).toBeVisible();

  await r.getByLabel("Option 1").uncheck();
  await expect(star).toBeHidden();
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByText(/received/i)).toBeVisible();
});

test("a form exported as JSON imports back as a new draft with the same questions", async ({
  page,
}) => {
  await signIn(page);
  await formFromTemplate(page, "rsvp-form");
  await page.getByRole("tab", { name: "Publish" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download JSON" }).click(),
  ]);
  const file = await download.path();
  const exported = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8")) as {
    id: string;
    fields: { label: string }[];
  };

  await page.goto("/app/");
  await page.getByLabel("Import a form from a JSON file").setInputFiles(file);
  await expect(page).toHaveURL(/\/app\/forms\/frm_/);
  expect(page.url()).not.toContain(exported.id);
  const questions = page.locator("article input[id$='-label']");
  await expect(questions).toHaveCount(exported.fields.length);
  await expect(questions.first()).toHaveValue(exported.fields[0]?.label ?? "");

  // A file that isn't a form is explained, not imported.
  await page.goto("/app/");
  await page.getByLabel("Import a form from a JSON file").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"title": "No schema version"}'),
  });
  await expect(page.getByRole("alert")).toContainText("isn't a form Freely Forms can read");
});

test("an answer must fit the format the owner set", async ({ page, browser, request }) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Order lookup");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("button", { name: "+ Short text", exact: true }).click();
  const card = page.locator("article").first();
  await card.getByRole("button", { name: /Field settings/ }).click();
  await card.getByLabel("Answer format").selectOption({ label: "Custom pattern…" });
  await expect(card.getByLabel("Pattern")).toHaveValue("AA-9999");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);

  const r = await (await browser.newContext()).newPage();
  await r.goto(url);
  await r.getByLabel("Short text").fill("12-ABCD");
  await waitForTurnstile(r);
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByText("Use the format AA-9999 (9 = digit, A = letter).")).toBeVisible();
  await r.getByLabel("Short text").fill("ab-1234");
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByText(/received/i)).toBeVisible();
  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  expect((await rows(request, spreadsheetId))[1]).toContain("ab-1234");
});

test("the conversational layout asks one question at a time", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await formFromTemplate(page, "contact-form");
  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByRole("button", { name: "One question at a time" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);

  const r = await (await browser.newContext()).newPage();
  await r.goto(url);
  const progress = r.locator(".progress");
  await expect(progress).toHaveText("Question 1 of 4");
  await expect(r.getByLabel("Name")).toBeVisible();
  await expect(r.getByLabel("Email")).toBeHidden();
  // Next checks only the question on screen.
  await r.getByRole("button", { name: "Next" }).click();
  await expect(r.getByText("This field is required.")).toBeVisible();
  await r.getByLabel("Name").fill("Grace Hopper");
  await r.getByLabel("Name").press("Enter");
  await expect(progress).toHaveText("Question 2 of 4");
  await r.getByLabel("Email").fill("grace@example.com");
  await r.getByRole("button", { name: "Next" }).click();
  await r.getByRole("button", { name: "Next" }).click(); // the topic is optional
  await expect(progress).toHaveText("Question 4 of 4");
  await r.getByLabel("Message").fill("One question at a time works.");
  await waitForTurnstile(r);
  await r.getByRole("button", { name: "Send message" }).click();
  await expect(r.getByText(/received/i)).toBeVisible();
  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
});

test("rating and scale answers arrive as numbers and can drive a follow-up", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await page.getByRole("button", { name: "+ New form" }).click();
  await page.getByLabel("Form name").fill("Feedback");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  for (const t of ["Rating", "Scale", "Long text"]) {
    await page.getByRole("button", { name: `+ ${t}`, exact: true }).click();
  }
  const scale = page.locator("article").nth(1);
  await scale.getByRole("button", { name: /Field settings/ }).click();
  await scale.getByLabel("From", { exact: true }).selectOption("0");
  await scale.getByLabel("To", { exact: true }).selectOption("10");
  // Ask what to improve only for scores below 7.
  const followUp = page.locator("article").nth(2);
  await followUp.getByRole("button", { name: "+ Show only if…" }).click();
  await followUp.getByLabel("Condition 1: question").selectOption({ label: "Scale" });
  await followUp.getByLabel("Condition 1: test").selectOption({ label: "is less than" });
  await followUp.getByLabel("Condition 1: value").fill("7");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const { url, spreadsheetId } = await publish(page);

  const r = await (await browser.newContext()).newPage();
  await r.goto(url);
  // Click what people see: the fourth star (the radio inside it is for screen readers).
  await r.locator(".rating label").nth(3).click();
  await expect(r.getByLabel("4 of 5")).toBeChecked();
  await expect(r.getByLabel("Long text")).toBeHidden();
  await r.locator(".scale-options label").filter({ hasText: /^3$/ }).click();
  await expect(r.getByLabel("Long text")).toBeVisible();
  await r.getByLabel("Long text").fill("Faster replies, please.");
  await waitForTurnstile(r);
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByText(/received/i)).toBeVisible();

  await expect.poll(async () => (await rows(request, spreadsheetId)).length).toBe(2);
  const [head, row] = await rows(request, spreadsheetId);
  expect(row?.[head?.indexOf("Rating") ?? -1]).toBe(4);
  expect(row?.[head?.indexOf("Scale") ?? -1]).toBe(3);
});
