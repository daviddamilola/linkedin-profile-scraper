import puppeteer from "puppeteer";
import { formatDate, getCleanText, getDurationInDays } from "./utils";

interface RawVolunteering {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  description: string | null;
}

export interface Volunteering {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  durationInDays: number | null;
  description: string | null;
}

export async function getVolunteering(
  page: puppeteer.Page
): Promise<Volunteering[]> {
  const rawVolunteerExperiences: RawVolunteering[] = await page.$$eval(
    ".pv-profile-section.volunteering-section ul > li.ember-view",
    (nodes) => {
      // Note: the $$eval context is the browser context.
      // So custom methods you define in this file are not available within this $$eval.
      let data: RawVolunteering[] = [];
      for (const node of nodes) {
        const titleElement = node.querySelector(".pv-entity__summary-info h3");
        const title = titleElement?.textContent || null;

        const companyElement = node.querySelector(
          ".pv-entity__summary-info span.pv-entity__secondary-title"
        );
        const company = companyElement?.textContent || null;

        const dateRangeElement = node.querySelector(
          ".pv-entity__date-range span:nth-child(2)"
        );
        const dateRangeText = dateRangeElement?.textContent || null;
        const startDatePart = dateRangeText?.split("–")[0] || null;
        const startDate = startDatePart?.trim() || null;

        const endDatePart = dateRangeText?.split("–")[1] || null;
        const endDateIsPresent =
          endDatePart?.trim().toLowerCase() === "present" || false;
        const endDate =
          endDatePart && !endDateIsPresent ? endDatePart.trim() : "Present";

        const descriptionElement = node.querySelector(
          ".pv-entity__description"
        );
        const description = descriptionElement?.textContent || null;

        data.push({
          title,
          company,
          startDate,
          endDate,
          endDateIsPresent,
          description,
        });
      }

      return data;
    }
  );

  // Convert the raw data to clean data using our utils
  // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
  const volunteering: Volunteering[] = rawVolunteerExperiences.map(
    (rawVolunteerExperience) => {
      const startDate = formatDate(rawVolunteerExperience.startDate);
      const endDate = formatDate(rawVolunteerExperience.endDate);

      return {
        ...rawVolunteerExperience,
        title: getCleanText(rawVolunteerExperience.title),
        company: getCleanText(rawVolunteerExperience.company),
        description: getCleanText(rawVolunteerExperience.description),
        startDate,
        endDate,
        durationInDays: getDurationInDays(startDate, endDate),
      };
    }
  );

  return volunteering;

  // statusLog(
  //   logSection,
  //   `Got volunteer experience data: ${JSON.stringify(volunteerExperiences)}`,
  //   scraperSessionId
  // );
}
