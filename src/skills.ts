import puppeteer from "puppeteer";

export interface Skill {
  skillName: string | null;
  endorsementCount: number | null;
}

export async function getSkills(
  profileUrl: string,
  createPage: () => Promise<puppeteer.Page>
): Promise<Skill[]> {
  const page = await createPage();

  await page.goto(profileUrl + "/details/skills", {
    waitUntil: "networkidle2",
  });

  const skills: Skill[] = await page.$$eval(
    ".pv-skill-categories-section ol > .ember-view",
    (nodes) => {
      // Note: the $$eval context is the browser context.
      // So custom methods you define in this file are not available within this $$eval.

      return nodes.map((node) => {
        const skillName = node.querySelector(
          ".pv-skill-category-entity__name-text"
        );
        const endorsementCount = node.querySelector(
          ".pv-skill-category-entity__endorsement-count"
        );

        return {
          skillName: skillName ? skillName.textContent?.trim() : null,
          endorsementCount: endorsementCount
            ? parseInt(endorsementCount.textContent?.trim() || "0")
            : 0,
        } as Skill;
      }) as Skill[];
    }
  );

  await page.close();

  return skills;
}
