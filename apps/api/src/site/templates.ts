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
      "A free contact form for your website. Messages arrive as rows in your own Google Sheet, with spam protection and no account needed to reply.",
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
      fld_start: "Stored as a real date, so you can sort by urgency.",
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
      fld_date: "A real date column you can sort by.",
      fld_contact: "Respecting how people want to be contacted gets more replies.",
    },
    extras: ["Property type", "Budget", "Access notes (gates, parking, pets)"],
    pitfalls: [
      "No location field: you quote jobs you can't travel to.",
      "Too few details: requests need a phone call before you can price them.",
      "No preferred contact method: calls may go unanswered.",
    ],
  },
];

export const templateBySlug = (slug: string) => TEMPLATES.find((t) => t.slug === slug);
