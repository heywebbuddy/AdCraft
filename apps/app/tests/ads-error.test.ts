import { test } from "node:test";
import assert from "node:assert/strict";
import { AdsApiError } from "@adcraft/ads";

test("Meta's user-facing message is what the activity log shows", () => {
  const err = new AdsApiError("meta", "/v21.0/act_1/adsets", 400, {
    error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 1885272, error_user_title: "Budget is too low", error_user_msg: "Your ad set budget must be more than ₹94.91 or your ads may not deliver." },
  });
  assert.match(err.message, /Budget is too low — Your ad set budget must be more than ₹94\.91/);
  assert.doesNotMatch(err.message, /OAuthException/);
});

test("an envelope with no human text still summarises", () => {
  const err = new AdsApiError("tiktok", "/campaign/create/", 400, { code: 40002, message: "advertiser_id is required" });
  assert.match(err.message, /advertiser_id is required/);
});
