import type { Form } from "@freelyforms/form-schema";

/**
 * Form templates for the website and "Use this template". Each `form` is a real schema-v1
 * definition (validated in tests); its `id` is replaced when an owner copies it. Page copy says
 * only what the product does today.
 */
export interface Template {
  slug: string;
  name: string;
  /** For the <title> and the meta description. */
  title: string;
  description: string;
  /** Who uses it and why, 2–3 sentences. */
  intro: string;
  form: Form;
  /** Why each field is there, keyed by field ID. */
  why: Record<string, string>;
  /** Fields people often add, as plain text. */
  extras: string[];
  /** Mistakes to avoid: the part generic template pages rarely cover. */
  pitfalls: string[];
}

const id = "frm_template00";

export const TEMPLATES: Template[] = [
  {
    slug: "contact-form",
    name: "Contact form",
    title: "Contact form template that saves to Google Sheets",
    description:
      "A free contact form for your website. Messages arrive as rows in your own Google Sheet; people can write to you without a Google account.",
    intro:
      "The form most websites need first: a way for visitors to reach you without exposing your email address to scrapers. Each message becomes a row in a Google Sheet you own, so you can sort, filter and share it with your team.",
    form: {
      schemaVersion: 1,
      id,
      title: "Contact us",
      description: "We usually reply within one business day.",
      settings: {
        submitLabel: "Send message",
        success: {
          type: "message",
          message: "Thanks — your message was received. We'll be in touch soon.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        {
          id: "fld_topic",
          type: "select",
          label: "What is it about?",
          options: [
            { id: "opt_question", label: "A question" },
            { id: "opt_sales", label: "Pricing or a quote" },
            { id: "opt_support", label: "Help with an order or service" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        {
          id: "fld_message",
          type: "textarea",
          label: "Message",
          required: true,
          minLength: 10,
          maxLength: 5000,
        },
      ],
    },
    why: {
      fld_name: "So your reply can start with a name, not 'Hi there'.",
      fld_email: "Checked for a valid format, so you can actually reply.",
      fld_topic: "Lets you filter the sheet and route messages without reading each one first.",
      fld_message: "A minimum length stops one-word messages; the maximum keeps cells readable.",
    },
    extras: ["Phone (if you call people back)", "Company name", "How did you hear about us?"],
    pitfalls: [
      "Asking for too much: each extra required field can reduce how many people finish the form.",
      "No topic field: you end up reading every message to decide who should answer it.",
      "Publishing your email address instead of a form: it can be collected by spam harvesters.",
    ],
  },
  {
    slug: "event-registration-form",
    name: "Event registration form",
    title: "Event registration form template (responses in Google Sheets)",
    description:
      "Collect registrations for workshops, meetups and events. Every sign-up lands in your Google Sheet, ready for name badges, emails and headcounts.",
    intro:
      "For workshops, meetups, classes and community events. The sheet becomes your guest list: sort by ticket type, count dietary requirements and export name badges without retyping anything.",
    form: {
      schemaVersion: 1,
      id,
      title: "Register for the event",
      settings: {
        submitLabel: "Register",
        success: { type: "message", message: "You're registered. See you there!" },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Full name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        {
          id: "fld_ticket",
          type: "radio",
          label: "Ticket",
          required: true,
          options: [
            { id: "opt_general", label: "General admission" },
            { id: "opt_student", label: "Student" },
            { id: "opt_speaker", label: "Speaker or volunteer" },
          ],
        },
        {
          id: "fld_guests",
          type: "number",
          label: "Additional guests",
          min: 0,
          max: 5,
          integer: true,
        },
        {
          id: "fld_dietary",
          type: "checkboxes",
          label: "Dietary requirements",
          options: [
            { id: "opt_veg", label: "Vegetarian" },
            { id: "opt_vegan", label: "Vegan" },
            { id: "opt_gf", label: "Gluten free" },
            { id: "opt_other", label: "Other (tell us below)" },
          ],
        },
        {
          id: "fld_notes",
          type: "textarea",
          label: "Accessibility needs or questions",
          maxLength: 2000,
        },
        {
          id: "fld_consent",
          type: "consent",
          label: "I agree to be contacted about this event.",
          required: true,
        },
      ],
    },
    why: {
      fld_name: "Printed on badges and check-in lists exactly as typed.",
      fld_email: "For the confirmation and any change of plans.",
      fld_ticket: "One column you can count for capacity per ticket type.",
      fld_guests: "A whole number between 0 and 5, so headcounts add up without cleanup.",
      fld_dietary: "Several answers can apply; each choice is written by its label.",
      fld_notes: "Gives people a private place to ask for what they need.",
      fld_consent: "Records that attendees agreed to event emails.",
    },
    extras: ["Organisation or company", "Session choices", "T-shirt size", "Emergency contact"],
    pitfalls: [
      "No guest count: your headcount can be off on the day.",
      "Free-text dietary answers: you can't count them; use choices plus a notes field.",
      "Forgetting accessibility questions until someone can't get in.",
    ],
  },
  {
    slug: "feedback-form",
    name: "Feedback form",
    title: "Feedback form template — collect feedback in Google Sheets",
    description:
      "A short feedback form with a rating, what worked and what didn't. Answers go to your own Google Sheet so you can chart them over time.",
    intro:
      "Short enough that people finish it: a rating, two open questions and an optional email for follow-up. Responses are rows in your sheet, so averages and trends are one formula away.",
    form: {
      schemaVersion: 1,
      id,
      title: "How did we do?",
      description: "Two minutes, and it helps us improve.",
      settings: {
        submitLabel: "Send feedback",
        success: { type: "message", message: "Thank you for the feedback!" },
      },
      fields: [
        {
          id: "fld_rating",
          type: "radio",
          label: "Overall, how satisfied are you?",
          required: true,
          options: [
            { id: "opt_5", label: "Very satisfied" },
            { id: "opt_4", label: "Satisfied" },
            { id: "opt_3", label: "Neutral" },
            { id: "opt_2", label: "Dissatisfied" },
            { id: "opt_1", label: "Very dissatisfied" },
          ],
        },
        { id: "fld_good", type: "textarea", label: "What worked well?", maxLength: 3000 },
        { id: "fld_better", type: "textarea", label: "What should we improve?", maxLength: 3000 },
        {
          id: "fld_email",
          type: "email",
          label: "Email (optional)",
          description: "Only if you'd like us to follow up.",
        },
      ],
    },
    why: {
      fld_rating: "A fixed scale you can count and chart, instead of free text.",
      fld_good: "Tells you what to keep doing, not only what to fix.",
      fld_better: "The answer you actually act on.",
      fld_email: "Optional, so people can stay anonymous if they prefer.",
    },
    extras: ["Which product, event or visit is this about?", "Would you recommend us?"],
    pitfalls: [
      "Long surveys: completion tends to drop as questions are added.",
      "Only a rating: you learn that something is wrong but not what.",
      "Making email required: some people give less candid feedback when they can be identified.",
    ],
  },
  {
    slug: "client-intake-form",
    name: "Client intake form",
    title: "Client intake form template for new clients — Google Sheets",
    description:
      "Onboard new clients with one form: contact details, what they need, budget and timeline. Each client becomes a row in your Google Sheet.",
    intro:
      "For consultants, agencies, freelancers and service businesses taking on new clients. Everything you'd otherwise collect over several emails arrives in one row of your sheet before the first call.",
    form: {
      schemaVersion: 1,
      id,
      title: "New client intake",
      description: "Tell us about you and your project. It takes about five minutes.",
      settings: {
        submitLabel: "Submit",
        success: {
          type: "message",
          message: "Thanks! We'll review this and get back to you to book a call.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_company", type: "text", label: "Business or organisation", maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone" },
        {
          id: "fld_service",
          type: "checkboxes",
          label: "What do you need help with?",
          required: true,
          options: [
            { id: "opt_strategy", label: "Strategy or advice" },
            { id: "opt_build", label: "Design or build" },
            { id: "opt_ongoing", label: "Ongoing support" },
            { id: "opt_unsure", label: "Not sure yet" },
          ],
        },
        {
          id: "fld_goals",
          type: "textarea",
          label: "What would a great outcome look like?",
          required: true,
          maxLength: 5000,
        },
        {
          id: "fld_budget",
          type: "select",
          label: "Budget range",
          options: [
            { id: "opt_small", label: "Under 2,000" },
            { id: "opt_mid", label: "2,000–10,000" },
            { id: "opt_large", label: "Over 10,000" },
            { id: "opt_unknown", label: "Not sure yet" },
          ],
        },
        { id: "fld_start", type: "date", label: "Ideal start date" },
        {
          id: "fld_consent",
          type: "consent",
          label: "I agree that you may store these details to respond to my enquiry.",
          required: true,
        },
      ],
    },
    why: {
      fld_name: "Who you'll be talking to.",
      fld_company: "Optional: individuals are clients too.",
      fld_email: "Validated so your first reply doesn't bounce.",
      fld_phone: "For people who'd rather talk than email.",
      fld_service: "Several can apply; each becomes readable text in the sheet.",
      fld_goals: "The most useful answer before a first call.",
      fld_budget:
        "Ranges are easier to answer than an exact number, and still let you qualify leads.",
      fld_start: "Written as YYYY-MM-DD, so sorting the column puts the most urgent first.",
      fld_consent: "A clear record that the client agreed you could keep their details.",
    },
    extras: [
      "Website or social link",
      "How did you hear about us?",
      "Preferred contact time",
      "ABN or company number (AU/NZ)",
    ],
    pitfalls: [
      "Asking for an exact budget: many people skip it; ranges are easier to answer.",
      "No goals question: the first call is spent on basics.",
      "Collecting sensitive details (health, IDs) in a general intake: keep those out unless you must.",
    ],
  },
  {
    slug: "quote-request-form",
    name: "Quote request form",
    title: "Quote request form template — send requests to Google Sheets",
    description:
      "Let customers request a quote with the details you need to price the job. Requests arrive as rows in your Google Sheet, ready to follow up.",
    intro:
      "For trades, contractors, studios and any business that prices per job. Asking the right questions up front means fewer back-and-forth emails before you can give a number.",
    form: {
      schemaVersion: 1,
      id,
      title: "Request a quote",
      settings: {
        submitLabel: "Request quote",
        success: {
          type: "message",
          message: "Thanks — we'll send your quote within two business days.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone", required: true },
        {
          id: "fld_location",
          type: "text",
          label: "Suburb or postcode of the job",
          required: true,
          maxLength: 200,
        },
        {
          id: "fld_job",
          type: "select",
          label: "Type of job",
          required: true,
          options: [
            { id: "opt_new", label: "New work" },
            { id: "opt_repair", label: "Repair" },
            { id: "opt_maintenance", label: "Maintenance" },
            { id: "opt_other", label: "Other" },
          ],
        },
        {
          id: "fld_details",
          type: "textarea",
          label: "Describe the job",
          required: true,
          minLength: 20,
          maxLength: 5000,
        },
        { id: "fld_date", type: "date", label: "When would you like it done?" },
        {
          id: "fld_contact",
          type: "radio",
          label: "Best way to reach you",
          options: [
            { id: "opt_phone", label: "Phone" },
            { id: "opt_email", label: "Email" },
          ],
        },
      ],
    },
    why: {
      fld_name: "Who the quote is for.",
      fld_email: "Where the quote goes.",
      fld_phone: "Many jobs need a quick call to confirm details.",
      fld_location: "Tells you straight away whether the job is in your area.",
      fld_job: "Lets you sort requests by kind of work.",
      fld_details: "A minimum length nudges people to give enough detail to price the job.",
      fld_date: "Written as YYYY-MM-DD, so the column sorts in date order.",
      fld_contact: "Respecting how people want to be contacted gets more replies.",
    },
    extras: ["Property type", "Budget", "Access notes (gates, parking, pets)"],
    pitfalls: [
      "No location field: you quote jobs you can't travel to.",
      "Too few details: requests need a phone call before you can price them.",
      "No preferred contact method: calls may go unanswered.",
    ],
  },
  {
    slug: "order-form",
    name: "Order form",
    title: "Order form template with a quantity per product, in Google Sheets",
    description:
      "Take orders for delivery or pickup with a quantity for each product. Orders land as rows in your Google Sheet, where a second tab can add up totals.",
    intro:
      "For bakeries, makers, fundraisers and small shops taking orders without an online store. Each product has its own quantity box, so the sheet gets numbers you can add up. Sort by date for the next day's list, and filter by 'Delivery' to plan the run.",
    form: {
      schemaVersion: 1,
      id,
      title: "Place an order",
      description:
        "Order by Thursday for weekend pickup or delivery. We'll confirm the total and payment by email.",
      settings: {
        submitLabel: "Place order",
        success: {
          type: "message",
          message: "Order received! We'll email you the total and payment details.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone", required: true },
        {
          id: "fld_qty_classic",
          type: "number",
          label: "Classic box: how many?",
          description: "24.00 each",
          min: 0,
          max: 20,
          integer: true,
        },
        {
          id: "fld_qty_family",
          type: "number",
          label: "Family box: how many?",
          description: "39.00 each",
          min: 0,
          max: 20,
          integer: true,
        },
        {
          id: "fld_qty_gift",
          type: "number",
          label: "Gift hamper: how many?",
          description: "55.00 each",
          min: 0,
          max: 10,
          integer: true,
        },
        {
          id: "fld_fulfilment",
          type: "radio",
          label: "Pickup or delivery?",
          required: true,
          options: [
            { id: "opt_pickup", label: "Pickup" },
            { id: "opt_delivery", label: "Delivery" },
          ],
        },
        {
          id: "fld_address",
          type: "textarea",
          label: "Delivery address (if delivering)",
          maxLength: 500,
        },
        { id: "fld_date", type: "date", label: "Pickup or delivery date", required: true },
        { id: "fld_notes", type: "textarea", label: "Order notes", maxLength: 2000 },
      ],
    },
    why: {
      fld_name: "Who the order is for, as it goes on the label.",
      fld_email: "Where the confirmation, total and payment details go.",
      fld_phone: "For delivery-day problems such as nobody answering the door.",
      fld_qty_classic:
        "One number field per product: written as a number, so a second tab can multiply it by the price.",
      fld_qty_family: "Whole numbers only, with a cap that stops a typo ordering 200.",
      fld_qty_gift:
        "Leave all three at 0 and the order is empty: the form can't require 'at least one', so check for blank rows.",
      fld_fulfilment: "Splits the sheet into a pickup list and a delivery run.",
      fld_address: "Only needed for delivery; pickup customers leave it blank.",
      fld_date: "Written as YYYY-MM-DD; sort by it to see what's due first.",
      fld_notes: "For messages on gift cards and allergy questions.",
    },
    extras: ["Gift message", "Preferred delivery time window", "Discount or member code"],
    pitfalls: [
      "Expecting the form to show a total or take payment: it does neither. On a second tab, multiply each quantity column by its price, and say on the form how people will pay.",
      "One 'items' text box for the whole order: you can't count '2 classic + a hamper'. A quantity field per product keeps every order countable.",
      "Selling out without noticing: when a product runs out, remove its field and republish the form; past orders keep their column.",
      "No status columns: add 'Paid' and 'Done' to the sheet so nothing ships unpaid. Columns you add are kept.",
    ],
  },
  {
    slug: "job-application-form",
    name: "Job application form",
    title: "Job application form template without the questions to avoid",
    description:
      "Collect applications with the role, experience, availability, right to work and references, without date-of-birth or family questions. Rows go to Google Sheets.",
    intro:
      "For cafés, shops, clinics, nonprofits and small firms hiring without an applicant tracking system. Every applicant becomes a row you can filter by role and availability. It leaves out date of birth, family and health questions, which can be used as evidence of discrimination.",
    form: {
      schemaVersion: 1,
      id,
      title: "Apply to join our team",
      settings: {
        submitLabel: "Submit application",
        success: {
          type: "message",
          message: "Thanks for applying! We'll be in touch if your application moves forward.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Full name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone", required: true },
        {
          id: "fld_position",
          type: "select",
          label: "Position",
          required: true,
          options: [
            { id: "opt_foh", label: "Front of house" },
            { id: "opt_kitchen", label: "Kitchen" },
            { id: "opt_driver", label: "Delivery driver" },
            { id: "opt_other", label: "Other (tell us below)" },
          ],
        },
        {
          id: "fld_cv_link",
          type: "text",
          label: "Link to your CV or LinkedIn profile",
          maxLength: 500,
        },
        {
          id: "fld_experience",
          type: "textarea",
          label: "Relevant experience",
          required: true,
          maxLength: 5000,
        },
        {
          id: "fld_availability",
          type: "checkboxes",
          label: "When can you work?",
          required: true,
          options: [
            { id: "opt_weekdays", label: "Weekdays" },
            { id: "opt_evenings", label: "Evenings" },
            { id: "opt_weekends", label: "Weekends" },
          ],
        },
        { id: "fld_start", type: "date", label: "Earliest start date" },
        {
          id: "fld_work_rights",
          type: "radio",
          label: "Do you have the right to work in this country?",
          required: true,
          options: [
            { id: "opt_yes", label: "Yes" },
            { id: "opt_sponsor", label: "I would need sponsorship" },
          ],
        },
        {
          id: "fld_adult",
          type: "radio",
          label: "Are you 18 or over?",
          required: true,
          options: [
            { id: "opt_yes", label: "Yes" },
            { id: "opt_no", label: "No" },
          ],
        },
        {
          id: "fld_references",
          type: "textarea",
          label: "Two references (name, relationship, phone or email)",
          maxLength: 2000,
        },
        {
          id: "fld_consent",
          type: "consent",
          label:
            "I agree that you may keep my application to consider me for this and similar roles.",
          required: true,
        },
      ],
    },
    why: {
      fld_name: "As it should appear in an offer letter.",
      fld_email: "For interview invitations and the outcome.",
      fld_phone: "Hourly roles are often filled with a quick call.",
      fld_position: "One form for every opening; filter by this column per role.",
      fld_cv_link:
        "This form doesn't take file uploads yet, so a link to a CV or profile does the job.",
      fld_experience: "Required, so every applicant gives you something to shortlist on.",
      fld_availability: "Several can apply; filter for 'Weekends' to find weekend staff.",
      fld_start: "Written as YYYY-MM-DD; shows who can start soonest.",
      fld_work_rights: "Asks about eligibility, not nationality or citizenship.",
      fld_adult: "A yes/no instead of a date of birth, for roles with a minimum age.",
      fld_references: "Collected up front, so checks don't hold up an offer.",
      fld_consent: "Records that the applicant agreed you could keep their details.",
    },
    extras: [
      "Cover letter",
      "Driver's licence (for driving roles)",
      "Salary expectations",
      "How did you hear about this role?",
    ],
    pitfalls: [
      "Asking for date of birth, marital status or number of children: in the US, the EEOC warns these questions may be used as evidence of intent to discriminate. If a role has a minimum age, ask 'Are you 18 or over?'",
      "Asking about health or disability before an offer: US law (the ADA) generally prohibits it at the application stage.",
      "Collecting Social Security or tax numbers on the application: you only need them once someone is hired, through payroll.",
      "Requiring a CV upload: this form can't take files yet, and many hourly applicants don't have a CV. A link field plus an experience box gets more applications.",
    ],
  },
  {
    slug: "time-off-request-form",
    name: "Time off request form",
    title: "Time off request form template with approval columns in the sheet",
    description:
      "Employees request leave with dates, type and cover; managers record decisions in a Status column they add. Each request is a row in your Google Sheet.",
    intro:
      "For small teams that track leave in a spreadsheet anyway. Requests arrive in one sheet with dates and cover arranged, and the manager records the decision in the next column.",
    form: {
      schemaVersion: 1,
      id,
      title: "Time off request",
      description: "Submit at least two weeks ahead for planned leave. Your manager will confirm.",
      settings: {
        submitLabel: "Request time off",
        success: {
          type: "message",
          message: "Request sent. Your manager will confirm before it's final.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Work email", required: true },
        { id: "fld_manager", type: "text", label: "Your manager", required: true, maxLength: 200 },
        {
          id: "fld_leave_type",
          type: "radio",
          label: "Type of leave",
          required: true,
          options: [
            { id: "opt_annual", label: "Annual leave or vacation" },
            { id: "opt_sick", label: "Sick leave" },
            { id: "opt_personal", label: "Personal or family" },
            { id: "opt_unpaid", label: "Unpaid leave" },
            { id: "opt_other", label: "Other" },
          ],
        },
        { id: "fld_from", type: "date", label: "First day off", required: true },
        { id: "fld_to", type: "date", label: "Last day off", required: true },
        {
          id: "fld_part_day",
          type: "radio",
          label: "Full days or part of a day?",
          options: [
            { id: "opt_full", label: "Full days" },
            { id: "opt_half", label: "Includes a half day" },
          ],
        },
        { id: "fld_cover", type: "text", label: "Who will cover your work?", maxLength: 200 },
        {
          id: "fld_notes",
          type: "textarea",
          label: "Notes for your manager",
          description: "No need to share medical details.",
          maxLength: 1000,
        },
      ],
    },
    why: {
      fld_name: "Who is away.",
      fld_email: "Where the manager's reply goes.",
      fld_manager: "Filter by this column so each manager sees their own team.",
      fld_leave_type: "Different types come out of different balances; one column to count each.",
      fld_from: "Sort by this column before approving anything, to see who else is off that week.",
      fld_to: "'Last day off' is clearer than 'return date', which people read differently.",
      fld_part_day: "Stops a half day being counted as a whole one.",
      fld_cover: "The first thing a manager asks before saying yes.",
      fld_notes: "The hint keeps health details out of a shared sheet.",
    },
    extras: [
      "Hours requested (for hourly staff)",
      "Leave balance before this request",
      "Contact while away",
    ],
    pitfalls: [
      "Assuming the form approves leave: it doesn't, and it doesn't notify anyone yet. Add 'Status' and 'Decided by' columns next to the answers. Freely Forms keeps columns you add.",
      "Sharing the form link outside the team: anyone with the link can submit a request, so send it only to staff.",
      "Asking why someone is sick: a leave type is enough, and medical details don't belong in a shared sheet.",
      "Deleting old rows: leave records may need to be kept. In the US, for example, FMLA leave records must be kept for at least three years.",
    ],
  },
  {
    slug: "rental-application-form",
    name: "Rental application form",
    title: "Rental application form template that collects less, not more",
    description:
      "Screen rental applicants with move-in date, household, rental history, income and references, without ID or Social Security numbers. Rows go to Google Sheets.",
    intro:
      "For private landlords and small letting agents comparing applicants for a vacancy. Applications land side by side in your sheet. ID and credit checks happen elsewhere, with a screening service or by sighting documents in person, so your sheet holds no copies of anyone's ID.",
    form: {
      schemaVersion: 1,
      id,
      title: "Rental application",
      description: "One application per adult who will live at the property.",
      settings: {
        submitLabel: "Submit application",
        success: {
          type: "message",
          message: "Application received. We'll contact you after we've reviewed all applications.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Full name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone", required: true },
        {
          id: "fld_property",
          type: "text",
          label: "Address of the property you're applying for",
          required: true,
          maxLength: 300,
        },
        { id: "fld_move_in", type: "date", label: "Preferred move-in date", required: true },
        {
          id: "fld_occupants",
          type: "number",
          label: "How many people will live there in total?",
          required: true,
          min: 1,
          max: 12,
          integer: true,
        },
        {
          id: "fld_history",
          type: "textarea",
          label: "Current address and how long you've lived there",
          required: true,
          maxLength: 1000,
        },
        {
          id: "fld_landlord_ref",
          type: "text",
          label: "Current landlord or agent (name and phone)",
          maxLength: 300,
        },
        {
          id: "fld_employment",
          type: "text",
          label: "Employer and role, or other source of income",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_income",
          type: "number",
          label: "Your income per month, before tax",
          min: 0,
        },
        {
          id: "fld_pets",
          type: "radio",
          label: "Will any pets live at the property?",
          required: true,
          options: [
            { id: "opt_no", label: "No" },
            { id: "opt_yes", label: "Yes (tell us below)" },
          ],
        },
        {
          id: "fld_notes",
          type: "textarea",
          label: "Pets, a guarantor, or anything else we should know",
          maxLength: 2000,
        },
        {
          id: "fld_consent",
          type: "consent",
          label: "I agree that you may contact my references and employer about this application.",
          required: true,
        },
      ],
    },
    why: {
      fld_name: "Matches the name on the lease if the application succeeds.",
      fld_email: "For the outcome, either way.",
      fld_phone: "Good applicants are often lost to a slow reply.",
      fld_property: "One form can serve several vacancies; filter by address.",
      fld_move_in: "Written as YYYY-MM-DD; sort to match applicants to the vacancy date.",
      fld_occupants:
        "Set the maximum to the property's occupancy limit and higher numbers are rejected, without asking who the people are.",
      fld_history: "The length of stay says more than the address.",
      fld_landlord_ref: "The reference most landlords call first.",
      fld_employment: "Lets you confirm income with the employer if you need to.",
      fld_income: "A number, so you can compare it with the rent on a second tab.",
      fld_pets: "Pet policies are a common deal-breaker; better known early.",
      fld_notes: "For context such as a recent move or a guarantor.",
      fld_consent: "Records permission to contact references before you call them.",
    },
    extras: [
      "Guarantor details",
      "Vehicle and parking needs",
      "Previous address (if less than a year at the current one)",
    ],
    pitfalls: [
      "Asking for Social Security, licence or passport numbers in the form: they'd sit in a shared spreadsheet. Let applicants enter them directly with your screening service.",
      "Questions about protected characteristics: in the US, the Fair Housing Act bars discrimination based on race, colour, religion, sex, disability, familial status or national origin. Leave out questions about children, religion or nationality.",
      "Using a generic form in Victoria, Australia: private rental applications there must use the form prescribed by Consumer Affairs Victoria, so don't use this template for Victorian properties.",
      "Asking for more than you'll use: NSW Fair Trading, for example, tells landlords to collect only the minimum needed to assess an application.",
    ],
  },
  {
    slug: "incident-report-form",
    name: "Incident report form",
    title: "Incident report form template for workplace injuries and near misses",
    description:
      "Record workplace incidents and near misses: when, where, what happened, injuries, witnesses and immediate action. Each report is a row in your Google Sheet.",
    intro:
      "For workplaces, venues, schools and volunteer groups that need an internal record of what happened, made while it's fresh. Reports from a phone go straight to one sheet, which becomes your incident log. Near misses are included, because they're the incidents that warn you.",
    form: {
      schemaVersion: 1,
      id,
      title: "Incident report",
      description:
        "If someone is seriously hurt, call emergency services first. Fill this in as soon as it's safe.",
      settings: {
        submitLabel: "Submit report",
        success: { type: "message", message: "Report submitted. Thank you for reporting it." },
      },
      fields: [
        { id: "fld_reporter", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_phone", type: "phone", label: "Your phone", required: true },
        {
          id: "fld_incident_type",
          type: "select",
          label: "What kind of incident?",
          required: true,
          options: [
            { id: "opt_injury", label: "Injury or illness" },
            { id: "opt_near_miss", label: "Near miss (no one hurt)" },
            { id: "opt_damage", label: "Property or equipment damage" },
            { id: "opt_security", label: "Security, theft or aggression" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        { id: "fld_date", type: "date", label: "Date it happened", required: true },
        {
          id: "fld_time",
          type: "text",
          label: "Approximate time it happened",
          placeholder: "e.g. 2:15 pm",
          required: true,
          maxLength: 50,
        },
        {
          id: "fld_location",
          type: "text",
          label: "Exact location",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_description",
          type: "textarea",
          label: "What happened?",
          description: "Facts in order: what was being done, what went wrong, what happened next.",
          required: true,
          minLength: 30,
          maxLength: 5000,
        },
        {
          id: "fld_injury",
          type: "radio",
          label: "Was anyone hurt?",
          required: true,
          options: [
            { id: "opt_none", label: "No" },
            { id: "opt_first_aid", label: "First aid only" },
            { id: "opt_medical", label: "Needed medical treatment" },
            { id: "opt_hospital", label: "Went to hospital" },
          ],
        },
        {
          id: "fld_people",
          type: "textarea",
          label: "People involved and witnesses (names and contact details)",
          maxLength: 2000,
        },
        {
          id: "fld_action",
          type: "textarea",
          label: "What was done straight away?",
          maxLength: 2000,
        },
      ],
    },
    why: {
      fld_reporter: "Who to ask for more detail.",
      fld_phone: "Follow-up questions are best asked while memories are fresh.",
      fld_incident_type:
        "Count near misses next to injuries to see patterns before someone is hurt.",
      fld_date: "When it happened, which can differ from when the report was sent.",
      fld_time: "Typed text, because the form has no time field yet.",
      fld_location: "'Loading dock, bay 3' is something you can fix; 'warehouse' isn't.",
      fld_description: "A minimum length, and a prompt to give facts in order rather than blame.",
      fld_injury: "Shows at a glance which reports may need to go to a regulator.",
      fld_people: "Witness statements get harder to collect every day.",
      fld_action: "Shows what was made safe and what is still open.",
    },
    extras: ["Equipment or vehicle involved", "Supervisor on duty", "Suggested way to prevent it"],
    pitfalls: [
      "Treating this form as the official notification: serious incidents must also be reported to the regulator, often within hours. In the US, OSHA requires a fatality to be reported within 8 hours and an in-patient hospitalisation, amputation or loss of an eye within 24, by phone or online (email doesn't count).",
      "Reading _submitted_at as the incident time: it's when the form was sent, in UTC. The date and time questions record when the incident happened.",
      "Putting medical detail in a widely shared sheet: describe the injury, not the person's health history, and limit who can open the sheet.",
      "Only reporting injuries: near misses show the same hazards without anyone getting hurt, so make them easy to report.",
    ],
  },
  {
    slug: "registration-form",
    name: "Registration form",
    title: "Registration form template for classes, courses and clubs",
    description:
      "Sign participants up for a class, course, club or season, with a parent or guardian field for under-18s. Every registration is a row in your Google Sheet.",
    intro:
      "For classes, courses, sports clubs and holiday programmes: anything people join for a term or a season rather than a single day. The sheet becomes your roster, with the session, the age group and the emergency contact on every row.",
    form: {
      schemaVersion: 1,
      id,
      title: "Registration",
      description: "One form per participant. Registering a child? Fill it in on their behalf.",
      settings: {
        submitLabel: "Register",
        success: {
          type: "message",
          message: "Thanks, the registration is in. We'll confirm the place by email.",
        },
      },
      fields: [
        {
          id: "fld_participant",
          type: "text",
          label: "Participant's full name",
          required: true,
          maxLength: 200,
        },
        {
          id: "fld_age_group",
          type: "radio",
          label: "Age group",
          required: true,
          options: [
            { id: "opt_under12", label: "Under 12" },
            { id: "opt_teen", label: "12–17" },
            { id: "opt_adult", label: "18 or over" },
          ],
        },
        {
          id: "fld_session",
          type: "select",
          label: "Session",
          required: true,
          options: [
            { id: "opt_mon", label: "Monday 4–5 pm, beginners" },
            { id: "opt_wed", label: "Wednesday 5–6 pm, intermediate" },
            { id: "opt_sat", label: "Saturday 10–11 am, all levels" },
          ],
        },
        {
          id: "fld_experience",
          type: "radio",
          label: "Experience",
          options: [
            { id: "opt_none", label: "New to this" },
            { id: "opt_some", label: "Some experience" },
            { id: "opt_regular", label: "Do it regularly" },
          ],
        },
        {
          id: "fld_guardian",
          type: "text",
          label: "Parent or guardian name (if under 18)",
          maxLength: 200,
        },
        {
          id: "fld_email",
          type: "email",
          label: "Contact email",
          description: "A parent or guardian's, if the participant is under 18.",
          required: true,
        },
        { id: "fld_phone", type: "phone", label: "Contact phone", required: true },
        {
          id: "fld_emergency",
          type: "text",
          label: "Emergency contact (name and phone)",
          description: "Someone other than the participant who can be reached during sessions.",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_notes",
          type: "textarea",
          label: "Anything the instructor should know?",
          maxLength: 2000,
        },
        {
          id: "fld_consent",
          type: "consent",
          label: "I agree to the programme terms and to being contacted about this registration.",
          required: true,
        },
        {
          id: "fld_photo",
          type: "consent",
          label:
            "I agree that photos including the participant may be used on our website and social media.",
        },
      ],
    },
    why: {
      fld_participant: "The person attending, which is not always the person filling in the form.",
      fld_age_group:
        "Enough to place people in the right group without collecting a date of birth.",
      fld_session: "One column to count per session, so you can see when a slot is full.",
      fld_experience: "Helps the instructor split a mixed group on the first day.",
      fld_guardian: "Optional, so adults can skip it; for children it records who signed them up.",
      fld_email: "Where the confirmation and any timetable changes go.",
      fld_phone: "For same-day messages such as a cancelled session.",
      fld_emergency:
        "A second person to call. It's on the same row as the session, so it's easy to find in a hurry.",
      fld_notes: "A private place for needs the instructor should plan for.",
      fld_consent: "A TRUE/FALSE record that the terms were accepted.",
      fld_photo:
        "Separate and optional, so a family can join without agreeing to photos. FALSE means no photos.",
    },
    extras: [
      "School or club the participant belongs to",
      "Membership or player number",
      "How did you hear about us?",
      "Second emergency contact",
    ],
    pitfalls: [
      "Expecting the form to stop at capacity: it doesn't. Count rows per session on a second tab with COUNTIF, take places in _submitted_at order, and remove a full session from the form before republishing.",
      "Bundling photo permission into the required terms: families who say no to photos can't register at all.",
      "Asking for a full date of birth when an age group is all you use: it's more personal data to keep safe.",
      "One form for a whole family: rows stop matching people. Ask for one registration per participant.",
    ],
  },
  {
    slug: "rsvp-form",
    name: "RSVP form",
    title: "RSVP form template with an accurate headcount in Google Sheets",
    description:
      "Collect yes and no replies for a wedding, party or dinner. Each reply is a row in your Google Sheet, with a party size you can total in one formula.",
    intro:
      "For weddings, birthdays, dinners and team events where you invite people rather than sell tickets. Replies land in your sheet with a yes or no and the number of people coming, so the caterer gets one number instead of a guess.",
    form: {
      schemaVersion: 1,
      id,
      title: "Will you join us?",
      description: "Please reply by the date on your invitation.",
      settings: {
        submitLabel: "Send reply",
        success: { type: "message", message: "Thanks for letting us know!" },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        {
          id: "fld_attending",
          type: "radio",
          label: "Will you be there?",
          required: true,
          options: [
            { id: "opt_yes", label: "Yes, I'll be there" },
            { id: "opt_no", label: "Sorry, I can't make it" },
          ],
        },
        {
          id: "fld_party",
          type: "number",
          label: "How many people in total, including you?",
          description: "Enter 0 if you can't come.",
          required: true,
          min: 0,
          max: 10,
          integer: true,
        },
        {
          id: "fld_guest_names",
          type: "textarea",
          label: "Names of everyone coming with you, and any meal needs",
          maxLength: 1000,
        },
        {
          id: "fld_meal",
          type: "checkboxes",
          label: "Meal needs in your group",
          options: [
            { id: "opt_veg", label: "Vegetarian" },
            { id: "opt_vegan", label: "Vegan" },
            { id: "opt_gf", label: "Gluten free" },
            { id: "opt_kids", label: "Children's meal" },
          ],
        },
        {
          id: "fld_email",
          type: "email",
          label: "Email for updates",
          description: "Only used if plans change.",
        },
        {
          id: "fld_message",
          type: "textarea",
          label: "A note for the hosts",
          maxLength: 2000,
        },
      ],
    },
    why: {
      fld_name: "So you can tick replies off against your guest list.",
      fld_attending:
        "A clear no is as useful as a yes: you stop waiting and can invite someone else.",
      fld_party:
        "'Including you' removes the most common counting error. Written as a number, so it can be summed.",
      fld_guest_names:
        "Place cards and the door list need names, and 'Sam (vegan)' tells the caterer who gets what.",
      fld_meal: "Flags which replies need special meals; the names box says who each one is for.",
      fld_email: "Optional: a change of venue or time needs a way to reach people.",
      fld_message: "Guests like to say something, and it keeps notes out of the meal answers.",
    },
    extras: [
      "Song request",
      "Arrival time or transport needs",
      "Which events (ceremony, reception)",
    ],
    pitfalls: [
      "Asking 'how many guests?': some people count themselves and some don't. Say 'in total, including you'.",
      "Summing the whole party column: on a second tab, use SUMIFS to add up party sizes only where the answer is 'Yes, I'll be there'.",
      "Counting people who replied twice: sort by name or email and keep the latest _submitted_at, because the newer reply is the one that stands.",
      "No 'can't make it' option: silence then means nothing, and you chase everyone before the deadline.",
    ],
  },
  {
    slug: "customer-satisfaction-survey",
    name: "Customer satisfaction survey",
    title: "Customer satisfaction survey template with CSAT and NPS questions",
    description:
      "Ask the satisfaction (CSAT), recommendation (NPS) and effort questions in one short survey, and calculate the scores correctly in your Google Sheet.",
    intro:
      "For businesses that want a number they can track month to month, not just comments. It asks three common scoring questions (satisfaction, likelihood to recommend and effort), plus one open question about why. Answers are stored so the scores take one formula each.",
    form: {
      schemaVersion: 1,
      id,
      title: "How are we doing?",
      description: "Five questions, about a minute.",
      settings: {
        submitLabel: "Submit",
        success: { type: "message", message: "Thank you. Every answer is read." },
      },
      fields: [
        {
          id: "fld_csat",
          type: "radio",
          label: "How satisfied are you with our service overall?",
          required: true,
          options: [
            { id: "opt_5", label: "Very satisfied" },
            { id: "opt_4", label: "Satisfied" },
            { id: "opt_3", label: "Neither satisfied nor dissatisfied" },
            { id: "opt_2", label: "Dissatisfied" },
            { id: "opt_1", label: "Very dissatisfied" },
          ],
        },
        {
          id: "fld_nps",
          type: "number",
          label: "How likely are you to recommend us to a friend or colleague?",
          description: "0 = not at all likely, 10 = extremely likely.",
          required: true,
          min: 0,
          max: 10,
          integer: true,
        },
        {
          id: "fld_effort",
          type: "radio",
          label: "How easy was it to get what you needed?",
          options: [
            { id: "opt_very_easy", label: "Very easy" },
            { id: "opt_easy", label: "Easy" },
            { id: "opt_neutral", label: "Neither easy nor difficult" },
            { id: "opt_hard", label: "Difficult" },
            { id: "opt_very_hard", label: "Very difficult" },
          ],
        },
        {
          id: "fld_touchpoint",
          type: "select",
          label: "What was your most recent contact with us about?",
          options: [
            { id: "opt_buying", label: "Buying" },
            { id: "opt_delivery", label: "Delivery or setup" },
            { id: "opt_support", label: "Support" },
            { id: "opt_billing", label: "Billing" },
          ],
        },
        {
          id: "fld_reason",
          type: "textarea",
          label: "What is the main reason for your scores?",
          maxLength: 3000,
        },
        {
          id: "fld_followup",
          type: "consent",
          label: "You may contact me about my answers.",
        },
        { id: "fld_email", type: "email", label: "Email (only if you ticked the box above)" },
      ],
    },
    why: {
      fld_csat:
        "The CSAT question. Five labelled steps, so 'satisfied' means the same to everyone.",
      fld_nps:
        "The standard 0–10 recommendation question. Stored as a number, so COUNTIF can sort scores into promoters and detractors.",
      fld_effort: "Shows friction that a high satisfaction score can hide.",
      fld_touchpoint:
        "Lets you compare scores for support and for billing, not only the overall score.",
      fld_reason: "One open question gets more answers than several.",
      fld_followup: "TRUE/FALSE, so you only reach out to people who asked for it.",
      fld_email:
        "Optional and only needed if the box above is ticked, so the survey can stay anonymous.",
    },
    extras: ["Order or ticket number", "Customer since (year)", "Product or plan used"],
    pitfalls: [
      "Averaging the satisfaction answers: CSAT is the share of 'Very satisfied' plus 'Satisfied' answers out of all answers, neutrals included. Two COUNTIFs on the label, divided by the response count.",
      'Averaging the 0–10 scores: Net Promoter Score (NPS®) is the percentage of 9s and 10s minus the percentage of 0–6s, so it runs from −100 to +100. Use COUNTIF(column, ">=9") and COUNTIF(column, "<=6") over the count.',
      "Changing the scale halfway through: scores before and after stop being comparable. The _form_version column tells you which version each answer came from.",
      "Surveying only happy customers (for example, after a 5-star review): the score then measures who you asked.",
    ],
  },
  {
    slug: "volunteer-form",
    name: "Volunteer form",
    title: "Volunteer form template: roles, availability and checks in one sheet",
    description:
      "Sign up volunteers with the roles they want, when they're free and their screening details. Each volunteer is a row in your Google Sheet.",
    intro:
      "For charities, schools, clubs and event organisers recruiting helpers. The sheet becomes your volunteer list: filter by role, see who's free on weekends and spot who still needs a check before working with children.",
    form: {
      schemaVersion: 1,
      id,
      title: "Volunteer with us",
      description: "Tell us how you'd like to help. A coordinator will be in touch.",
      settings: {
        submitLabel: "Sign up",
        success: {
          type: "message",
          message: "Thank you for offering your time! We'll contact you about next steps.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Full name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Mobile", required: true },
        {
          id: "fld_adult",
          type: "radio",
          label: "Are you 18 or over?",
          required: true,
          options: [
            { id: "opt_yes", label: "Yes" },
            { id: "opt_no", label: "No, I'm under 18" },
          ],
        },
        {
          id: "fld_roles",
          type: "checkboxes",
          label: "Which roles interest you?",
          required: true,
          options: [
            { id: "opt_events", label: "Event day crew" },
            { id: "opt_admin", label: "Office and admin" },
            { id: "opt_driving", label: "Driving" },
            { id: "opt_children", label: "Working with children or young people" },
            { id: "opt_fundraising", label: "Fundraising" },
          ],
        },
        {
          id: "fld_availability",
          type: "checkboxes",
          label: "When are you usually free?",
          required: true,
          options: [
            { id: "opt_wd_am", label: "Weekday mornings" },
            { id: "opt_wd_pm", label: "Weekday afternoons" },
            { id: "opt_wd_eve", label: "Weekday evenings" },
            { id: "opt_weekend", label: "Weekends" },
          ],
        },
        {
          id: "fld_skills",
          type: "textarea",
          label: "Skills or experience you'd like to use",
          maxLength: 2000,
        },
        {
          id: "fld_check",
          type: "text",
          label: "Working with children check number, if you have one",
          description: "Only for roles with children. We verify it with the agency that issued it.",
          maxLength: 100,
        },
        { id: "fld_check_expiry", type: "date", label: "Check expiry date" },
        {
          id: "fld_emergency",
          type: "text",
          label: "Emergency contact (name and phone)",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_consent",
          type: "consent",
          label: "I agree that you may keep these details to organise volunteering.",
          required: true,
        },
      ],
    },
    why: {
      fld_name: "For rosters and name badges.",
      fld_email: "For the welcome and rostering emails.",
      fld_phone: "Volunteer coordination happens by text on the day.",
      fld_adult: "Under-18s often need a parent's permission and some roles aren't open to them.",
      fld_roles:
        "Several can apply. They're written as one cell of labels, so a filter for 'Driving' finds every driver.",
      fld_availability:
        'Fixed choices you can count: COUNTIF(column, "*Weekends*") tells you how many people are free at weekends.',
      fld_skills: "Where you find the bookkeeper or photographer you didn't know you had.",
      fld_check:
        "Optional, and only a record: the check itself is done on the issuing agency's own service.",
      fld_check_expiry: "Its own date column, so sorting it shows whose check runs out first.",
      fld_emergency: "Needed before anyone works a shift.",
      fld_consent: "Records that the volunteer agreed you could keep their details.",
    },
    extras: [
      "T-shirt size",
      "Languages spoken",
      "Driver's licence held (yes/no)",
      "Parent or guardian contact for under-18s",
    ],
    pitfalls: [
      "Treating a typed check number as a cleared check: it's only a claim until you verify it with the issuer, such as Service NSW for a Working With Children Check (free for volunteers in NSW).",
      "Free-text availability ('most weekends, not school holidays'): you can't filter or count it. Use fixed choices and leave details for the skills box.",
      "Forgetting under-18s: without the age question you find out at the first shift.",
      "Asking every volunteer for a check: rules have exemptions. In NSW and Victoria, for example, under-18s don't need one, and parents volunteering in their own child's activity often don't either.",
    ],
  },
  {
    slug: "maintenance-request-form",
    name: "Maintenance request form",
    title: "Maintenance request form for tenants, with entry permission",
    description:
      "Let tenants or staff report repairs with the location, urgency and permission to enter. Each request is a row in your Google Sheet.",
    intro:
      "For landlords, property managers, schools and offices that take repair requests from the people in the building. A link or QR code replaces texts and phone calls, and every request arrives with the address, the problem and whether you may let yourself in.",
    form: {
      schemaVersion: 1,
      id,
      title: "Report a repair",
      description:
        "For emergencies such as a gas smell, flooding or exposed wiring, phone our emergency number now instead of using this form.",
      settings: {
        submitLabel: "Send request",
        success: {
          type: "message",
          message: "Thanks, your request is logged. We'll contact you to arrange the repair.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_phone", type: "phone", label: "Phone", required: true },
        { id: "fld_email", type: "email", label: "Email" },
        {
          id: "fld_unit",
          type: "text",
          label: "Address and unit number",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_area",
          type: "select",
          label: "Where is the problem?",
          required: true,
          options: [
            { id: "opt_kitchen", label: "Kitchen" },
            { id: "opt_bathroom", label: "Bathroom or laundry" },
            { id: "opt_rooms", label: "Bedroom or living area" },
            { id: "opt_outside", label: "Outside or garden" },
            { id: "opt_common", label: "Shared or common area" },
          ],
        },
        {
          id: "fld_issue",
          type: "select",
          label: "Type of problem",
          required: true,
          options: [
            { id: "opt_plumbing", label: "Plumbing or leak" },
            { id: "opt_electrical", label: "Electrical" },
            { id: "opt_hvac", label: "Heating or cooling" },
            { id: "opt_appliance", label: "Appliance" },
            { id: "opt_doors", label: "Doors, locks or windows" },
            { id: "opt_pests", label: "Pests" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        {
          id: "fld_urgency",
          type: "radio",
          label: "How urgent is it?",
          required: true,
          options: [
            { id: "opt_urgent", label: "Unsafe or causing damage" },
            { id: "opt_week", label: "Needs fixing this week" },
            { id: "opt_wait", label: "Can wait" },
          ],
        },
        {
          id: "fld_description",
          type: "textarea",
          label: "What's wrong?",
          description: "What you see, exactly where, and since when.",
          required: true,
          minLength: 20,
          maxLength: 3000,
        },
        {
          id: "fld_entry",
          type: "radio",
          label: "If you're not home, may we enter to do the repair?",
          required: true,
          options: [
            { id: "opt_enter", label: "Yes, after the usual notice" },
            { id: "opt_call", label: "No, contact me to arrange a time" },
          ],
        },
        {
          id: "fld_access",
          type: "text",
          label: "Pets, alarms or access notes",
          description: "Please don't enter alarm or key-safe codes; we'll ask how to get in.",
          maxLength: 500,
        },
      ],
    },
    why: {
      fld_name: "Who reported it, for the follow-up.",
      fld_phone: "Trades usually call ahead, so this one is required.",
      fld_email: "Optional, for a written record of the arrangement.",
      fld_unit: "In a building with many units, the address alone doesn't find the leak.",
      fld_area: "Tells the trade where to go once they're inside.",
      fld_issue: "Filter by this column to batch jobs for the same trade.",
      fld_urgency:
        "Plain-language choices instead of 'priority', so tenants don't mark everything urgent.",
      fld_description:
        "A minimum length gets 'kitchen tap drips from the base since Monday', not 'tap broken'.",
      fld_entry: "Saves a round of calls; written as the tenant's own choice on the request.",
      fld_access: "A dog or an alarm is what stops a trade at the door.",
    },
    extras: [
      "Best days and times to visit",
      "Has this happened before?",
      "Tenant reference or lease ID",
    ],
    pitfalls: [
      "Treating 'yes, you may enter' as the legal notice: notice rules still apply, and they vary. For example, NSW asks for at least 2 days for non-urgent repairs, Victoria 24 hours in writing, and New Zealand at least 24 hours.",
      "Letting emergencies come through a form: put the emergency number above the form, where people look first.",
      "Expecting photos: this form doesn't take uploads yet. Ask for photos when you reply, if the job needs them.",
      "Collecting alarm or key-safe codes in the form: they'd sit in a shared sheet. Ask whether there's an alarm, then get the code by phone.",
    ],
  },
  {
    slug: "work-order-form",
    name: "Work order form",
    title: "Work order form template: assign jobs and keep a log in Sheets",
    description:
      "Create work orders with the task, location, priority, assignee and due date. Each job becomes a row in a Google Sheet that works as your job log.",
    intro:
      "For facilities teams, maintenance supervisors and small trade businesses turning requests into assigned jobs. The person dispatching fills it in; the sheet becomes the running log you filter by technician, priority or due date. (Reporting a problem? Use the maintenance request form.)",
    form: {
      schemaVersion: 1,
      id,
      title: "New work order",
      settings: {
        submitLabel: "Create work order",
        success: { type: "message", message: "Work order created." },
      },
      fields: [
        {
          id: "fld_request_ref",
          type: "text",
          label: "Original request reference",
          description: "The request's ID or ticket number, if this job came from a request.",
          maxLength: 100,
        },
        {
          id: "fld_requested_by",
          type: "text",
          label: "Requested by",
          maxLength: 200,
        },
        {
          id: "fld_location",
          type: "text",
          label: "Location or asset",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_trade",
          type: "select",
          label: "Trade",
          required: true,
          options: [
            { id: "opt_electrical", label: "Electrical" },
            { id: "opt_plumbing", label: "Plumbing" },
            { id: "opt_hvac", label: "HVAC" },
            { id: "opt_carpentry", label: "Carpentry" },
            { id: "opt_general", label: "General maintenance" },
          ],
        },
        {
          id: "fld_task",
          type: "textarea",
          label: "Work to be done",
          required: true,
          minLength: 10,
          maxLength: 5000,
        },
        {
          id: "fld_priority",
          type: "radio",
          label: "Priority",
          required: true,
          options: [
            { id: "opt_emergency", label: "Emergency (today)" },
            { id: "opt_high", label: "High (within 2 days)" },
            { id: "opt_normal", label: "Normal (within 2 weeks)" },
            { id: "opt_low", label: "Low (when scheduled)" },
          ],
        },
        {
          id: "fld_assignee",
          type: "select",
          label: "Assigned to",
          required: true,
          options: [
            { id: "opt_tech1", label: "Technician 1" },
            { id: "opt_tech2", label: "Technician 2" },
            { id: "opt_contractor", label: "External contractor" },
          ],
        },
        { id: "fld_due", type: "date", label: "Due by", required: true },
        {
          id: "fld_hours",
          type: "number",
          label: "Estimated hours",
          min: 0,
          max: 500,
        },
        {
          id: "fld_parts",
          type: "textarea",
          label: "Parts and materials needed",
          maxLength: 3000,
        },
      ],
    },
    why: {
      fld_request_ref: "Links the job back to the request it came from.",
      fld_requested_by: "Who to tell when the job is done.",
      fld_location: "A room number or asset tag, so the technician doesn't have to ask.",
      fld_trade: "Lets you batch jobs by trade.",
      fld_task: "What 'done' means for this job, written before work starts.",
      fld_priority: "Each priority states its response time, so 'high' means the same to everyone.",
      fld_assignee:
        "A list instead of free text, so one person isn't spelled three ways. Replace the options with your team.",
      fld_due:
        "Sort ascending for the earliest due first; filter out finished jobs to see what's overdue.",
      fld_hours: "A number you can total per technician to see who is overloaded.",
      fld_parts: "Ordered before the visit, not discovered during it.",
    },
    extras: ["Estimated cost", "Downtime allowed (yes/no)", "Safety notes or permits needed"],
    pitfalls: [
      "Expecting the form to track progress: it creates the job. Add 'Status' and 'Completed on' columns in the sheet; columns you add are kept when the form changes.",
      "Waiting for sequential numbers: each row gets a unique _submission_id, not WO-0001. If you need running numbers, add your own column.",
      "Free-text assignees: 'Sam', 'sam' and 'Sam K' become three people when you filter.",
      "Adding up costs inside the form: it can't. Record hours and parts here, and price them on a separate tab.",
    ],
  },
  {
    slug: "employee-onboarding-form",
    name: "Employee onboarding form",
    title: "Employee onboarding form for new starters (no tax or bank details)",
    description:
      "Collect a new hire's contact details, start date, equipment needs and policy sign-off before day one. Each new starter is a row in your Google Sheet.",
    intro:
      "For small teams and HR leads preparing for a new hire. It gathers what IT, the office and the manager need before the first day. Payroll and identity documents are left to the systems built for them.",
    form: {
      schemaVersion: 1,
      id,
      title: "Welcome aboard",
      description: "A few details so everything is ready on your first day.",
      settings: {
        submitLabel: "Submit",
        success: { type: "message", message: "Thanks! See you on your first day." },
      },
      fields: [
        {
          id: "fld_legal_name",
          type: "text",
          label: "Legal full name",
          required: true,
          maxLength: 200,
        },
        { id: "fld_preferred", type: "text", label: "Name you'd like us to use", maxLength: 100 },
        { id: "fld_email", type: "email", label: "Personal email", required: true },
        { id: "fld_phone", type: "phone", label: "Mobile", required: true },
        { id: "fld_role", type: "text", label: "Job title", required: true, maxLength: 200 },
        { id: "fld_start", type: "date", label: "Start date", required: true },
        {
          id: "fld_emergency",
          type: "text",
          label: "Emergency contact (name, relationship and phone)",
          required: true,
          maxLength: 300,
        },
        {
          id: "fld_equipment",
          type: "checkboxes",
          label: "Which of these does your role need?",
          description: "Ask your manager if you're not sure.",
          options: [
            { id: "opt_laptop", label: "Laptop" },
            { id: "opt_monitor", label: "Monitor" },
            { id: "opt_phone", label: "Work phone" },
            { id: "opt_access", label: "Building access card" },
            { id: "opt_uniform", label: "Uniform" },
          ],
        },
        {
          id: "fld_first_day",
          type: "textarea",
          label: "Anything that would help your first week go well?",
          description: "Access needs, schedule constraints, the equipment you prefer.",
          maxLength: 2000,
        },
        {
          id: "fld_policies",
          type: "consent",
          label: "I have read the staff handbook and the IT acceptable-use policy.",
          required: true,
        },
      ],
    },
    why: {
      fld_legal_name: "Matches the contract and payroll records.",
      fld_preferred: "What goes on the email account, badge and welcome message.",
      fld_email: "Their work account doesn't exist yet, so this is how you reach them.",
      fld_phone: "For first-day logistics such as where to park.",
      fld_role: "Lets IT and the manager set up the right access.",
      fld_start: "Sort by this column to see who starts next and what's still missing.",
      fld_emergency: "Relationship is included, so whoever calls knows who they're speaking to.",
      fld_equipment:
        "Each choice is written by name, so IT can filter for 'Laptop' and order ahead.",
      fld_first_day: "Access or schedule needs raised now can be sorted before the desk is set up.",
      fld_policies:
        "Required, so it's always TRUE, and _submitted_at shows when. It's an acknowledgement, not an e-signature.",
    },
    extras: [
      "Pronouns",
      "T-shirt or uniform size",
      "Dietary needs for the welcome lunch",
      "LinkedIn profile",
    ],
    pitfalls: [
      "Collecting tax or Social Security numbers and bank details here: send them through your payroll system and official forms (such as the US W-4 and I-9). In Australia, tax file numbers are covered by the Privacy (Tax File Number) Rule.",
      "Sharing the sheet with the whole team: emergency contacts are personal. Share it with the people who set up the new starter, and nobody else.",
      "No preferred name: the email address and badge are made with a name the person never uses.",
      "Sending it on the first morning: equipment and access take days to arrange. Send it when the offer is accepted.",
    ],
  },
  {
    slug: "purchase-order-form",
    name: "Purchase order form",
    title: "Purchase order request form with budget codes, in Google Sheets",
    description:
      "Let staff request purchases with the supplier, items, estimated total and budget code. Finance gets one row per request in a Google Sheet.",
    intro:
      "For teams where staff ask and finance or a manager issues the purchase order. Requests stop arriving in chat messages without a cost centre. Each one is a row with the supplier, the amount and the reason.",
    form: {
      schemaVersion: 1,
      id,
      title: "Purchase request",
      settings: {
        submitLabel: "Submit request",
        success: {
          type: "message",
          message: "Request received. Finance will issue a PO number or come back with questions.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Requested by", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Work email", required: true },
        {
          id: "fld_department",
          type: "select",
          label: "Department",
          required: true,
          options: [
            { id: "opt_ops", label: "Operations" },
            { id: "opt_marketing", label: "Marketing" },
            { id: "opt_it", label: "IT" },
            { id: "opt_facilities", label: "Facilities" },
            { id: "opt_other", label: "Other" },
          ],
        },
        {
          id: "fld_cost_centre",
          type: "text",
          label: "Cost centre or budget code",
          required: true,
          maxLength: 50,
        },
        { id: "fld_supplier", type: "text", label: "Supplier", required: true, maxLength: 200 },
        {
          id: "fld_items",
          type: "textarea",
          label: "Items, quantities and unit prices",
          description: "One per line, for example: 10 × A4 paper box at 32.50",
          required: true,
          maxLength: 5000,
        },
        {
          id: "fld_amount",
          type: "number",
          label: "Estimated total before tax",
          required: true,
          min: 0,
        },
        { id: "fld_needed", type: "date", label: "Needed by" },
        {
          id: "fld_reason",
          type: "textarea",
          label: "What is it for?",
          required: true,
          maxLength: 2000,
        },
        { id: "fld_approver", type: "text", label: "Approving manager", maxLength: 200 },
      ],
    },
    why: {
      fld_name: "Who to ask about the order and who receives it.",
      fld_email: "For the PO number and any questions.",
      fld_department: "A fixed list, so spend can be grouped without cleanup.",
      fld_cost_centre: "Finance can't code a purchase without it, so it's required.",
      fld_supplier: "Shows straight away whether the supplier is already set up.",
      fld_items: "The detail the supplier needs, in the requester's words.",
      fld_amount:
        "A separate number, because line items in a text box can't be added up. SUMIF this column by cost centre on another tab.",
      fld_needed: "Written as YYYY-MM-DD; sort to see what has to be ordered first.",
      fld_reason: "The question an approver asks first.",
      fld_approver: "Who finance asks to approve it.",
    },
    extras: [
      "Supplier quote reference",
      "Delivery address",
      "Currency",
      "Recurring purchase (yes/no)",
    ],
    pitfalls: [
      "Expecting PO numbers from the form: each row has a unique _submission_id, not a running number. Finance adds a 'PO number' column in the sheet when the order is issued, and the column is kept.",
      "Expecting the form to approve or total the request: it doesn't. Add an 'Approved' column, and add up spend per cost centre on a separate tab.",
      "No cost centre: requests sit in a queue while someone works out who pays.",
      "Not saying whether amounts include tax, or which currency: totals from different requests stop being comparable.",
    ],
  },
  {
    slug: "course-evaluation-form",
    name: "Course evaluation form",
    title: "Course evaluation form that asks no names: student feedback in Sheets",
    description:
      "End-of-course feedback on clarity, materials, pace, workload and teaching, with no name or email fields. Results collect in your Google Sheet.",
    intro:
      "For teachers, trainers and course coordinators who want honest feedback at the end of a course or at the halfway point. Students don't sign in and aren't asked who they are. You get the same scale for every course, so results can be compared.",
    form: {
      schemaVersion: 1,
      id,
      title: "Course evaluation",
      description: "This form doesn't ask for your name. Results are read after grades are final.",
      settings: {
        submitLabel: "Submit evaluation",
        success: { type: "message", message: "Thank you, your feedback has been recorded." },
      },
      fields: [
        {
          id: "fld_course",
          type: "text",
          label: "Course name or code",
          description: "Type the code exactly as it appears on your timetable.",
          required: true,
          maxLength: 200,
        },
        { id: "fld_instructor", type: "text", label: "Instructor", maxLength: 200 },
        {
          id: "fld_objectives",
          type: "radio",
          label: "The course goals were clear",
          required: true,
          options: [
            { id: "opt_sa", label: "Strongly agree" },
            { id: "opt_a", label: "Agree" },
            { id: "opt_n", label: "Neutral" },
            { id: "opt_d", label: "Disagree" },
            { id: "opt_sd", label: "Strongly disagree" },
          ],
        },
        {
          id: "fld_materials",
          type: "radio",
          label: "The materials helped me learn",
          required: true,
          options: [
            { id: "opt_sa", label: "Strongly agree" },
            { id: "opt_a", label: "Agree" },
            { id: "opt_n", label: "Neutral" },
            { id: "opt_d", label: "Disagree" },
            { id: "opt_sd", label: "Strongly disagree" },
          ],
        },
        {
          id: "fld_pace",
          type: "radio",
          label: "The pace was",
          options: [
            { id: "opt_slow", label: "Too slow" },
            { id: "opt_right", label: "About right" },
            { id: "opt_fast", label: "Too fast" },
          ],
        },
        {
          id: "fld_workload",
          type: "radio",
          label: "Compared with similar courses, the workload was",
          options: [
            { id: "opt_lighter", label: "Lighter" },
            { id: "opt_similar", label: "About the same" },
            { id: "opt_heavier", label: "Heavier" },
          ],
        },
        {
          id: "fld_overall",
          type: "radio",
          label: "Overall, how would you rate this course?",
          required: true,
          options: [
            { id: "opt_excellent", label: "Excellent" },
            { id: "opt_good", label: "Good" },
            { id: "opt_fair", label: "Fair" },
            { id: "opt_poor", label: "Poor" },
          ],
        },
        { id: "fld_keep", type: "textarea", label: "What should stay the same?", maxLength: 3000 },
        {
          id: "fld_change",
          type: "textarea",
          label: "What one change would most improve this course?",
          maxLength: 3000,
        },
      ],
    },
    why: {
      fld_course: "One sheet can hold every course; filter by this column.",
      fld_instructor: "For team-taught courses; leave it out if there is one teacher.",
      fld_objectives:
        "A statement to agree or disagree with is quicker to answer than a 1–10 score.",
      fld_materials: "Separates 'the content was poor' from 'the teaching was poor'.",
      fld_pace: "Two ends and a middle, so 'too fast' and 'too slow' don't average out to 'fine'.",
      fld_workload: "Relative to other courses, because students judge workload by comparison.",
      fld_overall:
        "The one rating to track from term to term: count the share of 'Excellent' and 'Good' per course.",
      fld_keep: "Stops a good part of the course being cut by accident.",
      fld_change: "Asking for one change gets a priority, not a list.",
    },
    extras: [
      "Expected grade (to read ratings in context)",
      "Hours per week spent on the course",
      "Would you recommend this course?",
    ],
    pitfalls: [
      "Promising anonymity you can't keep: there are no name fields, but in a class of six, a timestamp or a distinctive comment can still point to one student. Say so, and read small classes in aggregate.",
      "Reading results before grades are final: students hold back if they think a teacher could react.",
      "Running it only at the end: a short halfway version gives the current class the benefit.",
      "Editing the scale between terms: answers stop lining up. The _form_version column shows which version each row came from.",
    ],
  },
  {
    slug: "lead-generation-form",
    name: "Lead generation form",
    title: "Lead generation form template with qualifying questions",
    description:
      "Capture leads with role, company size and buying timeframe as sortable columns, plus an opt-in box for marketing email. Each lead lands in your Google Sheet.",
    intro:
      "For B2B companies, agencies and consultants who need to know which enquiries to call first. A few closed questions sort leads as they arrive, and the sheet becomes the list your sales team works from.",
    form: {
      schemaVersion: 1,
      id,
      title: "Talk to us",
      description: "Tell us a little about you and we'll get back to you within one business day.",
      settings: {
        submitLabel: "Get in touch",
        success: { type: "message", message: "Thanks! Someone from our team will be in touch." },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Work email", required: true },
        { id: "fld_company", type: "text", label: "Company", required: true, maxLength: 200 },
        {
          id: "fld_role",
          type: "select",
          label: "Your role",
          options: [
            { id: "opt_owner", label: "Owner or founder" },
            { id: "opt_manager", label: "Manager or team lead" },
            { id: "opt_ic", label: "Team member" },
            { id: "opt_other", label: "Other" },
          ],
        },
        {
          id: "fld_company_size",
          type: "radio",
          label: "Company size",
          required: true,
          options: [
            { id: "opt_1", label: "1–10" },
            { id: "opt_11", label: "11–50" },
            { id: "opt_51", label: "51–200" },
            { id: "opt_201", label: "More than 200" },
          ],
        },
        {
          id: "fld_need",
          type: "select",
          label: "What are you looking for?",
          required: true,
          options: [
            { id: "opt_demo", label: "A demo" },
            { id: "opt_pricing", label: "Pricing" },
            { id: "opt_problem", label: "Help with a specific problem" },
            { id: "opt_research", label: "Just researching" },
          ],
        },
        {
          id: "fld_timeline",
          type: "radio",
          label: "When do you expect to decide?",
          options: [
            { id: "opt_month", label: "This month" },
            { id: "opt_quarter", label: "In the next 3 months" },
            { id: "opt_later", label: "Later" },
            { id: "opt_none", label: "No timeline yet" },
          ],
        },
        {
          id: "fld_trigger",
          type: "textarea",
          label: "What made you look into this now?",
          maxLength: 2000,
        },
        {
          id: "fld_marketing",
          type: "consent",
          label: "Send me occasional product news by email. I can unsubscribe at any time.",
        },
      ],
    },
    why: {
      fld_name: "For a personal first reply.",
      fld_email:
        "'Work email' tells people which address you want, and the domain shows the company.",
      fld_company: "Lets you look the company up before you call.",
      fld_role: "Shows whether you're talking to the person who decides.",
      fld_company_size: "Ranges are quick to pick and simple to sort by.",
      fld_need: "Filter demo requests for sales and keep 'just researching' for a newsletter.",
      fld_timeline: "The column that tells you who to call first.",
      fld_trigger: "Optional, and often the most useful line for the first call.",
      fld_marketing:
        "Optional and unticked, so its TRUE/FALSE value and the submission time are a record of who actually opted in.",
    },
    extras: ["Phone", "Country", "Website", "How did you find us?"],
    pitfalls: [
      "Treating a form submission as permission to send newsletters: keep marketing consent as its own optional box. In the US, CAN-SPAM also requires an opt-out in every marketing email.",
      "Too many required qualifiers: each one can cost leads. Make only the questions that change who follows up required.",
      "Expecting campaign tracking: this form doesn't capture UTM parameters yet. Ask 'How did you find us?' with fixed choices instead.",
      "Free-text company size and timeframe: you can't sort '50ish' against 'about 40 people'.",
    ],
  },
  {
    slug: "it-request-form",
    name: "IT request form",
    title: "IT request form template that separates impact from urgency",
    description:
      "Staff report IT problems and requests with the category, who's affected and whether they can work. Each ticket becomes a row in your Google Sheet.",
    intro:
      "For small IT teams, office managers and the one person everyone asks about the printer. Requests arrive in one queue instead of chats and hallway conversations. Two plain questions show what to fix first.",
    form: {
      schemaVersion: 1,
      id,
      title: "IT help request",
      description: "Never type a password into this form. We will never ask for one.",
      settings: {
        submitLabel: "Send request",
        success: {
          type: "message",
          message: "Got it. If you can't work at all, also call the IT line.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Work email", required: true },
        {
          id: "fld_category",
          type: "select",
          label: "What is it about?",
          required: true,
          options: [
            { id: "opt_hardware", label: "Computer or hardware" },
            { id: "opt_software", label: "Software or an app" },
            { id: "opt_access", label: "Account, password reset or access" },
            { id: "opt_network", label: "Network or Wi-Fi" },
            { id: "opt_new", label: "New equipment or software" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        {
          id: "fld_impact",
          type: "radio",
          label: "Who is affected?",
          required: true,
          options: [
            { id: "opt_me", label: "Just me" },
            { id: "opt_team", label: "My team" },
            { id: "opt_all", label: "Everyone, or customers" },
          ],
        },
        {
          id: "fld_urgency",
          type: "radio",
          label: "Can you work right now?",
          required: true,
          options: [
            { id: "opt_blocked", label: "No, I'm blocked" },
            { id: "opt_slow", label: "Yes, but it's slowing me down" },
            { id: "opt_later", label: "Yes, this is a request for later" },
          ],
        },
        { id: "fld_summary", type: "text", label: "Short summary", required: true, maxLength: 150 },
        {
          id: "fld_details",
          type: "textarea",
          label: "What happened, and what have you tried?",
          required: true,
          maxLength: 5000,
        },
        {
          id: "fld_error",
          type: "textarea",
          label: "Exact error message",
          description: "Copy and paste it if you can.",
          maxLength: 3000,
        },
        { id: "fld_device", type: "text", label: "Device name or asset tag", maxLength: 100 },
        { id: "fld_needed", type: "date", label: "Needed by (for requests)" },
      ],
    },
    why: {
      fld_name: "Who to follow up with.",
      fld_email: "Where you reply; the form doesn't send updates itself.",
      fld_category: "Routes access requests and hardware faults to different people.",
      fld_impact: "One half of priority: an outage for everyone beats one slow laptop.",
      fld_urgency:
        "The other half. Asking 'can you work?' gets an honest answer where 'priority?' gets 'high'.",
      fld_summary: "The line you scan in the sheet; short so it fits the column.",
      fld_details: "'What have you tried' saves asking 'have you restarted it?'",
      fld_error: "The exact wording is searchable; a paraphrase isn't.",
      fld_device: "Identifies the machine without a site visit.",
      fld_needed: "Turns 'ASAP' for a new starter's laptop into a real date.",
    },
    extras: ["Location or desk", "Phone or extension", "Manager approval needed (yes/no)"],
    pitfalls: [
      "One 'priority' dropdown: almost everyone picks 'high'. Who is affected plus whether they can work gives you priority without asking for it.",
      "Letting people send passwords: say on the form that you'll never ask for one, so a typed password doesn't end up in a shared sheet.",
      "Asking for screenshots: this form doesn't take attachments yet, so ask for the exact error text instead.",
      "Questions that only fit one category: use \"Show only if…\" on them, so a hardware request never asks for an app name and an access request never asks for a device.",
    ],
  },
  {
    slug: "project-intake-form",
    name: "Project intake form",
    title: "Project intake form for internal requests: goals, deadline, sponsor",
    description:
      "Colleagues request projects from your team with the goal, success measure, deadline type and sponsor. Each request is a row in your Google Sheet.",
    intro:
      "For PMOs and for design, marketing, data and ops teams that take work from colleagues. It replaces 'can you just…' messages with a request your team can accept, schedule or decline. (Taking on outside clients? Use the client intake form.)",
    form: {
      schemaVersion: 1,
      id,
      title: "Project request",
      description: "Tell us what you need and why. We review new requests every week.",
      settings: {
        submitLabel: "Submit request",
        success: {
          type: "message",
          message:
            "Thanks. This is a request, not an approval: we'll get back to you after the next review.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Your name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Work email", required: true },
        {
          id: "fld_team",
          type: "select",
          label: "Your team",
          required: true,
          options: [
            { id: "opt_sales", label: "Sales" },
            { id: "opt_marketing", label: "Marketing" },
            { id: "opt_product", label: "Product" },
            { id: "opt_ops", label: "Operations" },
            { id: "opt_other", label: "Other" },
          ],
        },
        { id: "fld_project", type: "text", label: "Project name", required: true, maxLength: 200 },
        {
          id: "fld_goal",
          type: "textarea",
          label: "What problem does this solve, and for whom?",
          required: true,
          maxLength: 3000,
        },
        {
          id: "fld_success",
          type: "textarea",
          label: "How will we know it worked?",
          maxLength: 2000,
        },
        {
          id: "fld_help",
          type: "checkboxes",
          label: "What do you need from us?",
          options: [
            { id: "opt_design", label: "Design" },
            { id: "opt_content", label: "Writing or content" },
            { id: "opt_build", label: "Build or development" },
            { id: "opt_data", label: "Data or reporting" },
            { id: "opt_unsure", label: "Not sure yet" },
          ],
        },
        { id: "fld_deadline", type: "date", label: "Deadline" },
        {
          id: "fld_deadline_type",
          type: "radio",
          label: "How fixed is that deadline?",
          required: true,
          options: [
            { id: "opt_fixed", label: "Fixed: tied to a launch, event or contract" },
            { id: "opt_target", label: "A target we could move" },
            { id: "opt_none", label: "No deadline" },
          ],
        },
        {
          id: "fld_if_not",
          type: "textarea",
          label: "What happens if we don't do this?",
          maxLength: 2000,
        },
        {
          id: "fld_sponsor",
          type: "text",
          label: "Sponsor (who signs off on the result)",
          required: true,
          maxLength: 200,
        },
      ],
    },
    why: {
      fld_name: "The day-to-day contact for the project.",
      fld_email: "For questions during review.",
      fld_team: "Shows which teams ask most and keeps capacity talks factual.",
      fld_project: "A name to refer to in planning meetings.",
      fld_goal: "Asks for the problem, not the solution, so you can suggest a better one.",
      fld_success: "Defines 'done' before work starts.",
      fld_help: "Several can apply; filter for 'Design' to see the design queue.",
      fld_deadline: "Read it with the next question: a date alone doesn't say whether it can move.",
      fld_deadline_type:
        "Separates real deadlines from hopeful ones, which is most of prioritising.",
      fld_if_not: "The quickest way to rank requests against each other.",
      fld_sponsor: "Work without someone to sign it off tends to stall at review.",
    },
    extras: [
      "Estimated budget",
      "Stakeholders to keep informed",
      "Links to briefs or documents",
      "Dependencies on other teams",
      "What is out of scope?",
    ],
    pitfalls: [
      "Every deadline treated as fixed: asking how fixed it is often turns many of them into targets you can plan around.",
      "Accepting requests without a sponsor: no one can sign off, so the project tends to stall at review.",
      "Solution-first requests ('we need an app'): the problem question lets you propose something smaller.",
      "Replying 'received' and nothing else: add 'Decision' and 'Review date' columns to the sheet and tell requesters when the review happens.",
    ],
  },
  {
    slug: "anonymous-feedback-form",
    name: "Anonymous feedback form",
    title: "Anonymous feedback form: what stays anonymous, and what doesn't",
    description:
      "Collect candid feedback without names, emails or sign-in. The page explains what still lands in your Google Sheet and how to protect people in small teams.",
    intro:
      "For managers, HR, schools and community groups who want honest feedback people won't put their name to. The form asks nothing about who is answering. This page also shows what can still identify someone, which matters more in a team of eight than in a company of 800.",
    form: {
      schemaVersion: 1,
      id,
      title: "Anonymous feedback",
      description:
        "This form doesn't ask who you are, and you don't need to sign in. Leave out details that would identify you or anyone else.",
      settings: {
        submitLabel: "Send anonymously",
        success: { type: "message", message: "Thank you. Your feedback has been received." },
      },
      fields: [
        {
          id: "fld_topic",
          type: "select",
          label: "What is it about?",
          options: [
            { id: "opt_culture", label: "Workplace and culture" },
            { id: "opt_management", label: "Management" },
            { id: "opt_process", label: "Processes and tools" },
            { id: "opt_safety", label: "Safety or wellbeing" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        {
          id: "fld_feedback",
          type: "textarea",
          label: "Your feedback",
          required: true,
          minLength: 10,
          maxLength: 5000,
        },
        {
          id: "fld_change",
          type: "textarea",
          label: "What would you change?",
          maxLength: 3000,
        },
        {
          id: "fld_raised",
          type: "radio",
          label: "Have you raised this before?",
          options: [
            { id: "opt_no", label: "No" },
            { id: "opt_yes_nothing", label: "Yes, and nothing changed" },
            { id: "opt_yes_handled", label: "Yes, and it's being handled" },
          ],
        },
      ],
    },
    why: {
      fld_topic: "Groups feedback without asking for anyone's team or role.",
      fld_feedback: "The only required question, so nobody is forced into detail.",
      fld_change: "Turns a complaint into something you can act on.",
      fld_raised: "Shows when the usual channels aren't working, without saying who.",
    },
    extras: [
      "A rating of how things are going (1–5)",
      "Department (only in organisations large enough that it doesn't identify people)",
    ],
    pitfalls: [
      "Forgetting the timestamp: the sheet has no name, email or IP address, but _submitted_at is exact. In a small team, 'sent at 9:02, just after the meeting' can point to one person. Send the link to everyone at once and read responses in a batch.",
      "Adding 'harmless' questions: team plus role plus years of service can narrow down to one person. Every extra demographic question makes the form less anonymous.",
      "Making more questions required: someone who can't answer without revealing themselves will give up instead.",
      "Using it for serious reports such as harassment or safety: you can't reply to an anonymous sender. Point people to a proper reporting channel too.",
    ],
  },
  {
    slug: "employee-evaluation-form",
    name: "Employee evaluation form",
    title: "Employee evaluation form with an example required for every rating",
    description:
      "A performance review form with a review period, defined ratings, an example for each and goals for next time. Each review is a row in your Google Sheet.",
    intro:
      "For managers and small-business owners running reviews without HR software. Each rating has to come with an example from the review period. That helps keep the review about the whole period, not only the last few weeks.",
    form: {
      schemaVersion: 1,
      id,
      title: "Performance review",
      description: "Complete one form per employee. Base ratings on the whole review period.",
      settings: {
        submitLabel: "Submit review",
        success: { type: "message", message: "Review submitted." },
      },
      fields: [
        {
          id: "fld_employee",
          type: "text",
          label: "Employee name",
          required: true,
          maxLength: 200,
        },
        { id: "fld_reviewer", type: "text", label: "Reviewer", required: true, maxLength: 200 },
        { id: "fld_period_start", type: "date", label: "Review period from", required: true },
        { id: "fld_period_end", type: "date", label: "Review period to", required: true },
        {
          id: "fld_quality",
          type: "radio",
          label: "Quality of work",
          required: true,
          options: [
            { id: "opt_exceeds", label: "Exceeds expectations" },
            { id: "opt_meets", label: "Meets expectations" },
            { id: "opt_partly", label: "Partly meets expectations" },
            { id: "opt_below", label: "Does not meet expectations" },
            { id: "opt_na", label: "Not observed" },
          ],
        },
        {
          id: "fld_quality_example",
          type: "textarea",
          label: "Example for quality of work",
          description: "Write n/a if not observed.",
          required: true,
          maxLength: 2000,
        },
        {
          id: "fld_teamwork",
          type: "radio",
          label: "Teamwork and communication",
          required: true,
          options: [
            { id: "opt_exceeds", label: "Exceeds expectations" },
            { id: "opt_meets", label: "Meets expectations" },
            { id: "opt_partly", label: "Partly meets expectations" },
            { id: "opt_below", label: "Does not meet expectations" },
            { id: "opt_na", label: "Not observed" },
          ],
        },
        {
          id: "fld_teamwork_example",
          type: "textarea",
          label: "Example for teamwork and communication",
          description: "Write n/a if not observed.",
          required: true,
          maxLength: 2000,
        },
        {
          id: "fld_goals_met",
          type: "radio",
          label: "Goals set for this period",
          required: true,
          options: [
            { id: "opt_all", label: "All met" },
            { id: "opt_most", label: "Most met" },
            { id: "opt_some", label: "Some met" },
            { id: "opt_none", label: "None met" },
            { id: "opt_no_goals", label: "No goals were set" },
          ],
        },
        { id: "fld_strengths", type: "textarea", label: "Strengths to build on", maxLength: 3000 },
        {
          id: "fld_next_goals",
          type: "textarea",
          label: "Goals for the next period",
          required: true,
          maxLength: 3000,
        },
      ],
    },
    why: {
      fld_employee: "Filter by this column to see one person's reviews over the years.",
      fld_reviewer: "Shows who gave each rating, useful when managers change.",
      fld_period_start: "Pins the review to dates, so it covers the whole period.",
      fld_period_end: "With the start date, it makes clear which period a rating covers.",
      fld_quality: "Named levels instead of numbers, so 'meets' means the same to every reviewer.",
      fld_quality_example: "Required: a rating without an example is hard to explain or defend.",
      fld_teamwork: "The same scale for every criterion keeps ratings comparable.",
      fld_teamwork_example: "An example from the period, not from last week.",
      fld_goals_met: "Links this review to the goals set in the last one.",
      fld_strengths: "Reviews that only list gaps miss what to keep doing.",
      fld_next_goals: "Becomes the starting point of the next review.",
    },
    extras: [
      "Employee's self-assessment",
      "Job title and department",
      "Training or support needed",
      "Overall rating",
    ],
    pitfalls: [
      "Rating from memory: recent weeks crowd out the rest of the period. Keep notes during the year and give an example for every rating.",
      "Undefined scales: one manager's 'meets' is another's 'exceeds'. Use named levels and a 'Not observed' option, so nobody guesses.",
      "Sharing the link or the sheet too widely: anyone with the form link can submit, and the sheet holds performance data. Keep both with the reviewers.",
      "Averaging the rating labels: they're written as text. Count them with COUNTIF on a separate tab.",
    ],
  },
  {
    slug: "complaint-form",
    name: "Complaint form",
    title: "Customer complaint form template that asks what would put it right",
    description:
      "Take customer complaints with the order reference, what happened and the outcome they want. Each complaint is a row in your Google Sheet, ready to resolve.",
    intro:
      "For shops, service businesses and clubs that want complaints in one place rather than spread across email, reviews and phone calls. It asks what went wrong and what the customer wants done, so the first reply can offer a fix.",
    form: {
      schemaVersion: 1,
      id,
      title: "Tell us what went wrong",
      description: "We read every complaint and aim to reply within two business days.",
      settings: {
        submitLabel: "Send complaint",
        success: {
          type: "message",
          message: "Thank you for telling us. We'll be in touch within two business days.",
        },
      },
      fields: [
        { id: "fld_name", type: "text", label: "Name", required: true, maxLength: 200 },
        { id: "fld_email", type: "email", label: "Email", required: true },
        { id: "fld_phone", type: "phone", label: "Phone" },
        {
          id: "fld_reference",
          type: "text",
          label: "Order, booking or account number",
          maxLength: 100,
        },
        {
          id: "fld_category",
          type: "select",
          label: "What is the complaint about?",
          required: true,
          options: [
            { id: "opt_product", label: "A product" },
            { id: "opt_delivery", label: "Delivery" },
            { id: "opt_billing", label: "Billing or a charge" },
            { id: "opt_service", label: "Service or staff" },
            { id: "opt_other", label: "Something else" },
          ],
        },
        { id: "fld_when", type: "date", label: "When did it happen?" },
        {
          id: "fld_description",
          type: "textarea",
          label: "What happened?",
          required: true,
          minLength: 20,
          maxLength: 5000,
        },
        {
          id: "fld_outcome",
          type: "radio",
          label: "What would put this right?",
          required: true,
          options: [
            { id: "opt_refund", label: "A refund" },
            { id: "opt_replace", label: "A replacement or repair" },
            { id: "opt_explain", label: "An explanation or apology" },
            { id: "opt_other", label: "Something else (tell us above)" },
          ],
        },
        {
          id: "fld_before",
          type: "radio",
          label: "Have you contacted us about this before?",
          options: [
            { id: "opt_first", label: "No, this is the first time" },
            { id: "opt_again", label: "Yes, and it isn't resolved" },
          ],
        },
      ],
    },
    why: {
      fld_name: "So the reply is to a person, not to 'Dear customer'.",
      fld_email:
        "Required, because a complaint you can't answer is more likely to become a public review.",
      fld_phone: "Optional; some complaints are faster to settle by phone.",
      fld_reference: "Finds the order without a reply asking for it.",
      fld_category: "Shows whether complaints cluster around delivery, billing or a product.",
      fld_when:
        "Written as YYYY-MM-DD, so you can match complaints to a bad week or a supplier batch.",
      fld_description: "A minimum length asks for the facts, not just 'terrible service'.",
      fld_outcome:
        "Knowing what the customer wants lets the first reply offer it, or explain early why you can't.",
      fld_before: "Repeat complaints go to the top of the pile.",
    },
    extras: ["Store or location", "Staff member involved", "Preferred contact method"],
    pitfalls: [
      "Not asking what outcome they want: you guess, offer the wrong thing, and the complaint goes another round.",
      "Expecting photos: this form doesn't take uploads yet, so ask for them in your first reply if you need them.",
      "Expecting an email receipt: the form shows a confirmation message but doesn't email the customer yet, so reply promptly.",
      "Losing track of resolution: add 'Status' and 'Resolved on' columns to the sheet; columns you add are kept.",
    ],
  },
];

export const templateBySlug = (slug: string) => TEMPLATES.find((t) => t.slug === slug);
