import puppeteer from "puppeteer";
import { getCleanText, getLocationFromText } from "./utils";

export interface Location {
  city: string | null;
  province: string | null;
  country: string | null;
}

interface RawProfile {
  fullName: string | null;
  title: string | null;
  location: string | null;
  photo: string | null;
  description: string | null;
  url: string;
}

export interface Profile {
  fullName: string | null;
  title: string | null;
  location: Location | null;
  photo: string | null;
  description: string | null;
  url: string;
}

export async function getProfile(page: puppeteer.Page): Promise<Profile> {
  const rawProfile: RawProfile = await page.evaluate(() => {
    const profileSection = document.querySelector(".pv-top-card");

    const url = window.location.href;

    const fullNameElement = profileSection?.querySelector("h1");
    const fullName = fullNameElement?.textContent || null;

    const titleElement = profileSection?.querySelector(
      ".pv-text-details__left-panel .text-body-medium"
    );
    const title = titleElement?.textContent || null;

    const locationElement = profileSection?.querySelector(
      ".pv-text-details__left-panel .text-body-small"
    );
    const location = locationElement?.textContent || null;

    const photoElement =
      profileSection?.querySelector(".pv-top-card__photo") ||
      profileSection?.querySelector(".profile-photo-edit__preview");
    const photo = photoElement?.getAttribute("src") || null;

    const descriptionElement = document.querySelector(
      ".pv-about__summary-text .lt-line-clamp__raw-line"
    ); // Is outside "profileSection"
    const description = descriptionElement?.textContent || null;

    return {
      fullName,
      title,
      location,
      photo,
      description,
      url,
    } as RawProfile;
  });

  // Convert the raw data to clean data using our utils
  // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
  const profile: Profile = {
    ...rawProfile,
    fullName: getCleanText(rawProfile.fullName),
    title: getCleanText(rawProfile.title),
    location: rawProfile.location
      ? getLocationFromText(rawProfile.location)
      : null,
    description: getCleanText(rawProfile.description),
  };

  return profile;
}
