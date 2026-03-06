import { db } from "./db";
import { candidateProfile, resumes, jobs, applicationAnswers, settings } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existingProfile = await db.select().from(candidateProfile).limit(1);
  if (existingProfile.length > 0) return;

  await db.insert(candidateProfile).values({
    fullName: "Sarah Mitchell",
    email: "sarah.mitchell@email.com",
    phone: "(555) 234-5678",
    location: "Chicago, IL",
    linkedinUrl: "https://linkedin.com/in/sarahmitchell",
    portfolioUrl: "https://sarahmitchell.dev",
    workAuthorization: "US Citizen",
    sponsorshipRequired: false,
    salaryPreference: "$75,000 - $95,000",
    willingToRelocate: true,
    preferredLocations: "Chicago, New York, Remote",
    preferredJobTypes: ["Remote", "Hybrid"],
    yearsOfExperience: "4",
  });

  await db.insert(resumes).values([
    {
      name: "Data Analyst Resume - General",
      roleType: "Data Analyst",
      plainText: "Sarah Mitchell | Data Analyst\nChicago, IL | sarah.mitchell@email.com\n\nSummary: Results-driven Data Analyst with 4 years of experience in SQL, Python, Tableau, and Excel. Strong background in data cleaning, statistical analysis, and reporting dashboards.\n\nExperience:\n- Data Analyst, TechCorp (2022-Present): Built automated reporting pipelines, reduced report generation time by 40%. Created Tableau dashboards for executive team.\n- Junior Data Analyst, DataWorks (2020-2022): Performed ad-hoc analysis, maintained ETL processes, supported business intelligence team.\n\nSkills: SQL, Python, Tableau, Power BI, Excel, R, ETL, Data Warehousing, Statistics",
      active: true,
    },
    {
      name: "Healthcare Data Analyst Resume",
      roleType: "Healthcare Data Analyst",
      plainText: "Sarah Mitchell | Healthcare Data Analyst\nChicago, IL | sarah.mitchell@email.com\n\nSummary: Healthcare-focused Data Analyst with experience in clinical data, EHR systems, and regulatory reporting. HIPAA certified with strong SQL and analytics skills.\n\nExperience:\n- Data Analyst, TechCorp (2022-Present): Analyzed healthcare claims data, built quality metrics dashboards, ensured HIPAA compliance in all data handling.\n- Junior Data Analyst, DataWorks (2020-2022): Supported clinical research team with data extraction and statistical analysis.\n\nSkills: SQL, Python, Tableau, Epic/EHR, HIPAA, Clinical Data, Healthcare Analytics, SAS",
      active: true,
    },
    {
      name: "Healthcare Analyst Resume",
      roleType: "Healthcare Analyst",
      plainText: "Sarah Mitchell | Healthcare Analyst\nChicago, IL | sarah.mitchell@email.com\n\nSummary: Healthcare Analyst with expertise in operations analysis, quality improvement, and process optimization within healthcare organizations.\n\nExperience:\n- Data Analyst, TechCorp (2022-Present): Led operational efficiency projects, analyzed patient flow data, presented findings to clinical leadership.\n- Junior Data Analyst, DataWorks (2020-2022): Created operational reports, tracked KPIs for patient satisfaction and outcomes.\n\nSkills: Healthcare Operations, Process Improvement, SQL, Excel, Lean Six Sigma, Quality Metrics, Regulatory Compliance",
      active: true,
    },
    {
      name: "Business Analyst Resume",
      roleType: "Business Analyst",
      plainText: "Sarah Mitchell | Business Analyst\nChicago, IL | sarah.mitchell@email.com\n\nSummary: Business Analyst with strong requirements gathering, stakeholder management, and data analysis skills. Experienced in Agile environments.\n\nExperience:\n- Data Analyst, TechCorp (2022-Present): Gathered business requirements, created process documentation, facilitated sprint planning sessions.\n- Junior Data Analyst, DataWorks (2020-2022): Supported product team with market analysis and competitive research.\n\nSkills: Requirements Gathering, Agile/Scrum, JIRA, SQL, Stakeholder Management, Process Mapping, UAT, Business Intelligence",
      active: true,
    },
  ]);

  const sampleJobs = [
    {
      title: "Data Analyst",
      company: "Acme Analytics",
      source: "LinkedIn",
      location: "Chicago, IL",
      workMode: "Hybrid",
      datePosted: "2026-03-04",
      description: "We are looking for a Data Analyst to join our growing analytics team. You will work with SQL and Python to analyze large datasets, build Tableau dashboards, and present insights to stakeholders. Requirements: 3+ years of experience with SQL, Python, and data visualization tools. Experience with ETL processes preferred.",
      applyLink: "https://linkedin.com/jobs/12345",
      roleClassification: "Data Analyst",
      fitLabel: "Strong Match",
      resumeRecommendation: "Data Analyst",
      status: "New",
      priority: "High",
      notes: "",
      followUpDate: "",
    },
    {
      title: "Healthcare Data Analyst",
      company: "MedTech Solutions",
      source: "Indeed",
      location: "Remote",
      workMode: "Remote",
      datePosted: "2026-03-03",
      description: "MedTech Solutions is seeking a Healthcare Data Analyst to support our clinical operations team. Responsibilities include analyzing clinical data, building reporting dashboards, and ensuring data quality across EHR systems. Must have experience with SQL, healthcare data standards, and HIPAA compliance.",
      applyLink: "https://indeed.com/jobs/67890",
      roleClassification: "Healthcare Data Analyst",
      fitLabel: "Strong Match",
      resumeRecommendation: "Healthcare Data Analyst",
      status: "Reviewed",
      priority: "High",
      notes: "Great fit - remote position with healthcare focus",
      followUpDate: "2026-03-10",
    },
    {
      title: "Business Analyst - Operations",
      company: "Global Dynamics",
      source: "Glassdoor",
      location: "New York, NY",
      workMode: "Onsite",
      datePosted: "2026-03-02",
      description: "Looking for a Business Analyst to drive operational improvements. You'll gather requirements from stakeholders, create process documentation, and work with the development team in an Agile environment. Experience with JIRA and SQL required. Healthcare industry experience a plus.",
      applyLink: "https://glassdoor.com/jobs/abcde",
      roleClassification: "Business Analyst",
      fitLabel: "Possible Match",
      resumeRecommendation: "Business Analyst",
      status: "Ready to Apply",
      priority: "Medium",
      notes: "Onsite in NYC - would need relocation",
      followUpDate: "2026-03-12",
    },
    {
      title: "Senior Data Analyst",
      company: "FinVista Corp",
      source: "LinkedIn",
      location: "San Francisco, CA",
      workMode: "Remote",
      datePosted: "2026-03-01",
      description: "FinVista is hiring a Senior Data Analyst for our finance analytics team. You will build data models, create automated reporting solutions, and mentor junior analysts. Requires 5+ years of experience with SQL, Python, and Tableau. Financial services experience preferred.",
      applyLink: "https://linkedin.com/jobs/senior-da",
      roleClassification: "Data Analyst",
      fitLabel: "Possible Match",
      resumeRecommendation: "Data Analyst",
      status: "Applied",
      priority: "Medium",
      notes: "Applied on March 2. Waiting for response.",
      followUpDate: "2026-03-08",
    },
    {
      title: "Healthcare Analyst - Quality Improvement",
      company: "Northshore Health",
      source: "Company Website",
      location: "Chicago, IL",
      workMode: "Hybrid",
      datePosted: "2026-02-28",
      description: "Join our Quality Improvement team as a Healthcare Analyst. Responsibilities include tracking quality metrics, analyzing patient outcomes data, supporting regulatory compliance efforts, and presenting findings to clinical leadership. SQL and Excel skills required.",
      applyLink: "https://northshorehealth.com/careers/ha-qi",
      roleClassification: "Healthcare Analyst",
      fitLabel: "Strong Match",
      resumeRecommendation: "Healthcare Analyst",
      status: "Interview",
      priority: "High",
      notes: "Phone interview scheduled for March 10",
      followUpDate: "2026-03-10",
    },
    {
      title: "Junior Data Analyst",
      company: "StartupXYZ",
      source: "Referral",
      location: "Austin, TX",
      workMode: "Remote",
      datePosted: "2026-02-25",
      description: "Entry-level Data Analyst position. Looking for someone with SQL knowledge and Excel skills. Will work on basic reporting and data entry. No experience required.",
      applyLink: "https://startupxyz.com/careers",
      roleClassification: "Data Analyst",
      fitLabel: "Weak Match",
      resumeRecommendation: "Data Analyst",
      status: "Skipped",
      priority: "Low",
      notes: "Too junior for my experience level",
      followUpDate: "",
    },
  ];

  await db.insert(jobs).values(sampleJobs);

  await db.insert(applicationAnswers).values([
    {
      question: "Why are you interested in this role?",
      answer: "I am passionate about using data to drive meaningful business decisions. With my background in SQL, Python, and data visualization, I am confident I can contribute to your team's analytical capabilities and help uncover insights that improve operations.",
    },
    {
      question: "Describe your experience with SQL",
      answer: "I have 4 years of hands-on SQL experience including complex queries, stored procedures, CTEs, window functions, and query optimization. I've worked with PostgreSQL, MySQL, and SQL Server across various projects involving millions of records.",
    },
    {
      question: "What is your greatest strength?",
      answer: "My greatest strength is translating complex data findings into clear, actionable recommendations for non-technical stakeholders. I focus on creating visual stories through dashboards that drive decision-making.",
    },
    {
      question: "Are you willing to work in a hybrid environment?",
      answer: "Yes, I am comfortable working in hybrid environments. I value both in-person collaboration and focused remote work, and I have experience being productive in both settings.",
    },
  ]);

  await db.insert(settings).values({
    key: "app_settings",
    value: {
      roleCategories: ["Data Analyst", "Healthcare Data Analyst", "Healthcare Analyst", "Business Analyst"],
      sources: ["LinkedIn", "Indeed", "Glassdoor", "Company Website", "Referral"],
      statuses: ["New", "Reviewed", "Ready to Apply", "Applied", "Skipped", "Interview", "Rejected"],
    },
  });

  console.log("Seed data inserted successfully");
}
