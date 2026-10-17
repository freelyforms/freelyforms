/**
 * Google Picker (ADR 0006): the owner chooses an existing spreadsheet, which gives this app
 * `drive.file` access to that one file. Google's script is loaded only when the owner asks for it.
 */
import { api } from "./api.js";

interface PickerResponse {
  action: string;
  docs?: { id: string; name?: string }[];
}

interface PickerGlobal {
  load: (name: string, callback: () => void) => void;
}

interface PickerBuilder {
  addView: (view: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  setCallback: (cb: (r: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

interface PickerNamespace {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { SPREADSHEETS: string };
  PickerBuilder: new () => PickerBuilder;
}

declare global {
  interface Window {
    gapi?: PickerGlobal;
    google?: { picker?: PickerNamespace };
  }
}

let loading: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    const fail = () => {
      loading = null;
      reject(new Error("picker_script"));
    };
    const timer = setTimeout(fail, 20_000);
    script.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    script.onload = () => {
      window.gapi?.load("picker", () => {
        clearTimeout(timer);
        const picker = window.google?.picker;
        if (picker) resolve(picker);
        else fail();
      });
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Opens the Picker; resolves to the chosen spreadsheet's ID, or null if the owner cancels. */
export async function pickSpreadsheet(): Promise<string | null> {
  const [config, picker] = await Promise.all([api.pickerConfig(), loadPicker()]);
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(picker.ViewId.SPREADSHEETS)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setTitle("Choose a spreadsheet for responses")
      .setCallback((r) => {
        // "loaded" is informational; any other outcome ends the picker without a choice.
        if (r.action === picker.Action.PICKED) resolve(r.docs?.[0]?.id ?? null);
        else if (r.action !== "loaded") resolve(null);
      })
      .build()
      .setVisible(true);
  });
}
