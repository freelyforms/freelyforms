import type { Form } from "@freelyforms/form-schema";
import { describe, expect, it } from "vitest";
import { prefillValues } from "./prefill.js";

const form: Pick<Form, "fields"> = {
  fields: [
    { id: "fld_name", type: "text", label: "Name" },
    {
      id: "fld_size",
      type: "radio",
      label: "Size",
      options: [
        { id: "opt_s", label: "Small" },
        { id: "opt_l", label: "Large" },
      ],
    },
    {
      id: "fld_days",
      type: "checkboxes",
      label: "Days",
      options: [
        { id: "opt_mon", label: "Monday" },
        { id: "opt_tue", label: "Tuesday" },
      ],
    },
    { id: "fld_ok", type: "consent", label: "I agree" },
    { id: "fld_src", type: "hidden", label: "Source", param: "utm_source" },
  ],
};

const prefill = (query: string) => prefillValues(form, new URLSearchParams(query));

describe("prefillValues", () => {
  it("fills fields by ID and choices by option ID or label", () => {
    expect(
      prefill("fld_name=Ada&fld_size=large&fld_days=opt_mon&fld_days=Tuesday&utm_source=news"),
    ).toEqual({
      fld_name: "Ada",
      fld_size: "opt_l",
      fld_days: ["opt_mon", "opt_tue"],
      fld_src: "news",
    });
  });

  it("ignores unknown options, empty values, consent and the hidden field's ID", () => {
    expect(prefill("fld_size=huge&fld_name=&fld_ok=on&fld_src=x")).toEqual({});
  });
});
