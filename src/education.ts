import puppeteer from "puppeteer";
import { formatDate, getCleanText, getDurationInDays } from "./utils";

interface RawEducation {
  schoolName: string | null;
  degreeName: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface Education {
  schoolName: string | null;
  degreeName: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  durationInDays: number | null;
}

export async function getEducation(
  profileUrl: string,
  createPage: () => Promise<puppeteer.Page>
): Promise<Education[]> {
  const page = await createPage();

  await page.goto(profileUrl + "/details/education", {
    waitUntil: "networkidle2",
  });

  const rawEducationData: RawEducation[] = await page.$$eval(
    "#education-section ul > .ember-view",
    (nodes) => {
      // Note: the $$eval context is the browser context.
      // So custom methods you define in this file are not available within this $$eval.
      let data: RawEducation[] = [];
      for (const node of nodes) {
        const schoolNameElement = node.querySelector(
          "h3.pv-entity__school-name"
        );
        const schoolName = schoolNameElement?.textContent || null;

        const degreeNameElement = node.querySelector(
          ".pv-entity__degree-name .pv-entity__comma-item"
        );
        const degreeName = degreeNameElement?.textContent || null;

        const fieldOfStudyElement = node.querySelector(
          ".pv-entity__fos .pv-entity__comma-item"
        );
        const fieldOfStudy = fieldOfStudyElement?.textContent || null;

        // const gradeElement = node.querySelector('.pv-entity__grade .pv-entity__comma-item');
        // const grade = (gradeElement && gradeElement.textContent) ? window.getCleanText(fieldOfStudyElement.textContent) : null;

        const dateRangeElement = node.querySelectorAll(
          ".pv-entity__dates time"
        );

        const startDatePart =
          (dateRangeElement && dateRangeElement[0]?.textContent) || null;
        const startDate = startDatePart || null;

        const endDatePart =
          (dateRangeElement && dateRangeElement[1]?.textContent) || null;
        const endDate = endDatePart || null;

        data.push({
          schoolName,
          degreeName,
          fieldOfStudy,
          startDate,
          endDate,
        });
      }

      return data;
    }
  );

  await page.close();

  // Convert the raw data to clean data using our utils
  // So we don't have to inject our util methods inside the browser context, which is too damn difficult using TypeScript
  const educations: Education[] = rawEducationData.map((rawEducation) => {
    const startDate = formatDate(rawEducation.startDate);
    const endDate = formatDate(rawEducation.endDate);

    return {
      ...rawEducation,
      schoolName: getCleanText(rawEducation.schoolName),
      degreeName: getCleanText(rawEducation.degreeName),
      fieldOfStudy: getCleanText(rawEducation.fieldOfStudy),
      startDate,
      endDate,
      durationInDays: getDurationInDays(startDate, endDate),
    };
  });

  return educations;
}
