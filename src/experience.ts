import puppeteer, { Page } from "puppeteer";
import {
  formatDate,
  getDurationInDays,
  getCleanText,
  getLocationFromText,
} from "./utils";

interface RawExperience {
  title: string | null;
  company: string | null;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  description: string | null;
}

export interface Experience {
  title: string | null;
  company: string | null;
  employmentType: string | null;
  location: Location | null;
  startDate: string | null;
  endDate: string | null;
  endDateIsPresent: boolean;
  durationInDays: number | null;
  description: string | null;
}

export async function getExperiences(
  profileUrl: string,
  createPage: () => Promise<Page>
): Promise<Experience[]> {
  const page = await createPage();

  await page.goto(profileUrl + "/details/experience", {
    waitUntil: "networkidle2",
  });

  const rawExperiencesData: RawExperience[] = await page.$$eval(
    "#experience-section ul > .ember-view",
    (nodes) => {
      let data: RawExperience[] = [];

      // Using a for loop so we can use await inside of it
      for (const node of nodes) {
        const titleElement = node.querySelector("h3");
        const title = titleElement?.textContent || null;

        const employmentTypeElement = node.querySelector(
          "span.pv-entity__secondary-title"
        );
        const employmentType = employmentTypeElement?.textContent || null;

        const companyElement = node.querySelector(
          ".pv-entity__secondary-title"
        );
        const companyElementClean =
          companyElement && companyElement?.querySelector("span")
            ? companyElement?.removeChild(
                companyElement.querySelector("span") as Node
              ) && companyElement
            : companyElement || null;
        const company = companyElementClean?.textContent || null;

        const descriptionElement = node.querySelector(
          ".pv-entity__description"
        );
        const description = descriptionElement?.textContent || null;

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

        const locationElement = node.querySelector(
          ".pv-entity__location span:nth-child(2)"
        );
        const location = locationElement?.textContent || null;

        data.push({
          title,
          company,
          employmentType,
          location,
          startDate,
          endDate,
          endDateIsPresent,
          description,
        });
      }

      return data;
    }
  );

  await page.close();

  const experiences: Experience[] = rawExperiencesData.map((rawExperience) => {
    const startDate = formatDate(rawExperience.startDate);
    const endDate = formatDate(rawExperience.endDate) || null;
    const endDateIsPresent = rawExperience.endDateIsPresent;

    const durationInDaysWithEndDate =
      startDate && endDate && !endDateIsPresent
        ? getDurationInDays(startDate, endDate)
        : null;
    const durationInDaysForPresentDate =
      endDateIsPresent && startDate
        ? getDurationInDays(startDate, new Date())
        : null;
    const durationInDays = endDateIsPresent
      ? durationInDaysForPresentDate
      : durationInDaysWithEndDate;

    return {
      ...rawExperience,
      title: getCleanText(rawExperience.title),
      company: getCleanText(rawExperience.company),
      employmentType: getCleanText(rawExperience.employmentType),
      location: rawExperience?.location
        ? getLocationFromText(rawExperience.location)
        : null,
      startDate,
      endDate,
      endDateIsPresent,
      durationInDays,
      description: getCleanText(rawExperience.description),
    };
  });

  return experiences;
}
