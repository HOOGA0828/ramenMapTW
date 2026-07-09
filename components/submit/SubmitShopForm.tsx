"use client";

import { Check, Send } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import type { RamenStyle } from "@/lib/types";

type Props = {
  styles: RamenStyle[];
};

type FormState = {
  google_maps_url: string;
  suggested_styles: string[];
};

const GOOGLE_MAPS_URL_PATTERN = /(?:google\.[^/\s]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page\/)/i;

const initialState: FormState = {
  google_maps_url: "",
  suggested_styles: []
};

export function SubmitShopForm({ styles }: Props) {
  const [form, setForm] = useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedStyleNames = useMemo(
    () => styles.filter((style) => form.suggested_styles.includes(style.slug)).map((style) => style.name),
    [form.suggested_styles, styles]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleStyle(slug: string) {
    setForm((current) => ({
      ...current,
      suggested_styles: current.suggested_styles.includes(slug)
        ? current.suggested_styles.filter((item) => item !== slug)
        : [...current.suggested_styles, slug]
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const googleMapsUrl = form.google_maps_url.trim();
    if (!googleMapsUrl || !GOOGLE_MAPS_URL_PATTERN.test(googleMapsUrl)) {
      setMessage({ type: "error", text: "請貼上 Google Maps 店家資訊連結。" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          google_maps_url: googleMapsUrl,
          suggested_styles: selectedStyleNames
        })
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? "投稿送出失敗，請稍後再試。");
      }

      setForm(initialState);
      setMessage({ type: "success", text: "投稿已送出，謝謝你補完這碗拉麵地圖。" });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "投稿送出失敗，請稍後再試。"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="submit-page">
      <div className="submit-copy">
        <p>Submit</p>
        <h1>投稿拉麵店</h1>
        <span>貼上 Google Maps 店家資訊連結，並選擇你推薦的拉麵派系。</span>
      </div>

      <form className="submit-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field wide">
            <span>Google Maps 資訊連結 *</span>
            <input
              value={form.google_maps_url}
              onChange={(event) => updateField("google_maps_url", event.target.value)}
              placeholder="https://maps.google.com/..."
              required
            />
          </label>
        </div>

        <div className="field">
          <span className="field-label">建議拉麵派系</span>
          <div className="style-grid">
            {styles.map((style) => (
              <button
                className={form.suggested_styles.includes(style.slug) ? "style-chip is-active" : "style-chip"}
                key={style.id}
                type="button"
                onClick={() => toggleStyle(style.slug)}
              >
                {style.name}
              </button>
            ))}
          </div>
        </div>

        {message ? <p className={message.type === "success" ? "success-text" : "error-text"}>{message.text}</p> : null}

        <button className="primary-button submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Check size={16} /> : <Send size={16} />}
          {isSubmitting ? "送出中" : "送出投稿"}
        </button>
      </form>
    </section>
  );
}
