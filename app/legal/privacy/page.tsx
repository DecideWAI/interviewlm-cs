import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - InterviewLM",
  description: "Privacy Policy for InterviewLM AI-powered interview platform",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back to Home
          </Link>
        </div>

        <div className="prose prose-invert max-w-none">
          <h1 className="text-4xl font-bold text-text-primary mb-2">
            Privacy Policy
          </h1>
          <p className="text-text-secondary mb-8">
            Last Updated: {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric"
            })}
          </p>

          <div className="space-y-8 text-text-secondary">
            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                1. Introduction
              </h2>
              <p>
                InterviewLM ("we", "us", or "our") is committed to protecting your privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your
                information when you use our AI-powered technical assessment platform
                ("Service").
              </p>
              <p className="mt-4">
                This policy applies to all users of the Service, including organizations that
                purchase assessment credits ("Customers") and individuals who participate in
                interviews ("Candidates").
              </p>
              <p className="mt-4">
                Please read this Privacy Policy carefully. By using the Service, you agree to
                the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                2. Information We Collect
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                2.1 Information You Provide
              </h3>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Account Information (Customers)
              </h4>
              <ul className="list-disc pl-6 space-y-1">
                <li>Name and email address</li>
                <li>Organization name and details</li>
                <li>Billing information (processed by third-party payment providers)</li>
                <li>Password (stored in encrypted form)</li>
              </ul>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Candidate Information
              </h4>
              <ul className="list-disc pl-6 space-y-1">
                <li>Name and email address (provided by the Customer)</li>
                <li>Interview responses and code submissions</li>
                <li>AI chat interactions</li>
                <li>Terminal commands and outputs</li>
                <li>Assessment scores and performance metrics</li>
              </ul>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Assessment Content
              </h4>
              <ul className="list-disc pl-6 space-y-1">
                <li>Custom coding problems and test cases created by Customers</li>
                <li>Assessment configurations and settings</li>
                <li>Evaluation criteria and rubrics</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                2.2 Information Automatically Collected
              </h3>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Session Recording Data
              </h4>
              <p>
                When Candidates participate in interviews, we automatically record:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Code changes and edit history (timestamped)</li>
                <li>File operations (create, read, update, delete)</li>
                <li>AI assistant conversations and prompts</li>
                <li>Terminal commands, outputs, and errors</li>
                <li>Test execution results</li>
                <li>Timestamps for all activities</li>
                <li>Browser and device information</li>
              </ul>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Usage Information
              </h4>
              <ul className="list-disc pl-6 space-y-1">
                <li>IP addresses and geographic location (country-level)</li>
                <li>Browser type, version, and settings</li>
                <li>Operating system and device information</li>
                <li>Pages visited and features used</li>
                <li>Time spent on the Service</li>
                <li>Referral sources</li>
              </ul>

              <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2">
                Cookies and Tracking Technologies
              </h4>
              <p>
                We use cookies and similar tracking technologies to track activity on our
                Service and hold certain information:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
                <li><strong>Analytics Cookies:</strong> Help us understand how users interact with the Service</li>
                <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                3. How We Use Your Information
              </h2>
              <p>
                We use the information we collect for the following purposes:
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.1 To Provide and Maintain the Service
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process and manage user accounts</li>
                <li>Facilitate technical interviews and assessments</li>
                <li>Execute code in secure sandboxed environments</li>
                <li>Provide AI-powered coding assistance to Candidates</li>
                <li>Generate assessment reports and analytics</li>
                <li>Enable session recording and playback</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.2 To Improve and Optimize the Service
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Analyze usage patterns and trends</li>
                <li>Develop new features and functionality</li>
                <li>Improve AI assistant performance and accuracy</li>
                <li>Optimize code execution environments</li>
                <li>Enhance user experience and interface design</li>
                <li>Conduct research and development</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.3 For Communication
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Send interview invitations to Candidates</li>
                <li>Notify users of assessment results (if configured)</li>
                <li>Provide customer support and respond to inquiries</li>
                <li>Send service announcements and updates</li>
                <li>Deliver marketing communications (with consent)</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.4 For Security and Legal Compliance
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Detect and prevent fraud, abuse, and security incidents</li>
                <li>Monitor compliance with our Terms of Service</li>
                <li>Comply with legal obligations and law enforcement requests</li>
                <li>Protect the rights, property, and safety of InterviewLM, our users, and the public</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.5 With Your Consent
              </h3>
              <p>
                We may use your information for other purposes with your explicit consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                4. How We Share Your Information
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.1 With Customers (For Candidate Data)
              </h3>
              <p>
                Candidate interview data (code submissions, chat logs, session recordings, and
                assessment results) is shared with the Customer who initiated the assessment.
                This is necessary to fulfill the core purpose of the Service.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.2 With Service Providers
              </h3>
              <p>
                We share information with third-party service providers who perform services
                on our behalf:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li><strong>Cloud Infrastructure:</strong> AWS, Vercel, Modal (for hosting and compute)</li>
                <li><strong>AI Services:</strong> Anthropic (Claude AI for coding assistance)</li>
                <li><strong>Payment Processing:</strong> Paddle (for billing and payments)</li>
                <li><strong>Email Delivery:</strong> Resend (for transactional emails)</li>
                <li><strong>Analytics:</strong> Analytics providers (for usage metrics)</li>
              </ul>
              <p className="mt-4">
                These service providers are contractually obligated to use your information
                only as necessary to provide their services and to protect your information.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.3 For Legal Reasons
              </h3>
              <p>
                We may disclose your information if required to do so by law or in response to:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Valid legal process (subpoenas, court orders)</li>
                <li>Law enforcement or government agency requests</li>
                <li>Protection of our legal rights and safety</li>
                <li>Investigation of fraud or security issues</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.4 Business Transfers
              </h3>
              <p>
                If InterviewLM is involved in a merger, acquisition, or sale of assets, your
                information may be transferred. We will provide notice before your information
                is transferred and becomes subject to a different privacy policy.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.5 Aggregated and De-identified Data
              </h3>
              <p>
                We may share aggregated, anonymized, or de-identified information that cannot
                reasonably be used to identify you. This may include industry reports, research
                papers, or product improvements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                5. Data Retention
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                5.1 Retention Periods
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Account Data:</strong> Retained for the duration of your account plus 90 days after closure</li>
                <li><strong>Session Recordings:</strong> Retained for 12 months by default, configurable by Customers (up to 24 months)</li>
                <li><strong>Assessment Results:</strong> Retained for 12 months by default</li>
                <li><strong>Billing Information:</strong> Retained for 7 years to comply with tax and accounting requirements</li>
                <li><strong>Analytics Data:</strong> Retained for 24 months</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                5.2 Early Deletion
              </h3>
              <p>
                You may request early deletion of your data by contacting privacy@interviewlm.com.
                We will delete your data within 30 days of verification, except where we are
                required by law to retain it.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                6. Data Security
              </h2>
              <p>
                We implement industry-standard security measures to protect your information:
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.1 Technical Safeguards
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Encryption in transit (TLS 1.3) and at rest (AES-256)</li>
                <li>Secure authentication with bcrypt password hashing</li>
                <li>Regular security audits and penetration testing</li>
                <li>Automated vulnerability scanning</li>
                <li>Code execution in isolated sandboxed environments</li>
                <li>Database access controls and audit logging</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.2 Organizational Safeguards
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Employee access controls (principle of least privilege)</li>
                <li>Security training for all personnel</li>
                <li>Incident response procedures</li>
                <li>Regular backups with encryption</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.3 Limitations
              </h3>
              <p>
                While we strive to protect your information, no security system is impenetrable.
                We cannot guarantee the absolute security of your data. You are responsible for
                maintaining the confidentiality of your account credentials.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                7. Your Rights and Choices
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.1 Access and Portability
              </h3>
              <p>
                You have the right to request access to your personal information and receive
                a copy in a portable format (JSON or CSV). Contact privacy@interviewlm.com to
                submit a request.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.2 Correction
              </h3>
              <p>
                You can update your account information at any time through your account settings.
                For Candidate data corrections, contact the Customer who administered your
                assessment.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.3 Deletion
              </h3>
              <p>
                You can request deletion of your personal information by contacting
                privacy@interviewlm.com. We will honor deletion requests except where retention
                is required by law or necessary for legitimate business purposes.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.4 Opt-Out of Marketing
              </h3>
              <p>
                You can opt out of marketing communications at any time by clicking the
                "unsubscribe" link in emails or contacting support@interviewlm.com. You will
                continue to receive transactional emails necessary for the Service.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.5 Cookie Preferences
              </h3>
              <p>
                Most browsers allow you to control cookies through their settings. Note that
                disabling essential cookies may limit your ability to use certain features of
                the Service.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                7.6 For Candidates
              </h3>
              <p>
                If you participated in an interview, your data is controlled by the Customer
                (the organization that invited you). For privacy requests regarding interview
                data, please contact the Customer directly. We will assist with requests as a
                data processor.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                8. Regional Privacy Rights
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.1 GDPR (European Economic Area)
              </h3>
              <p>
                If you are located in the EEA, you have additional rights under the General
                Data Protection Regulation (GDPR):
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Right to object to processing</li>
                <li>Right to restrict processing</li>
                <li>Right to data portability</li>
                <li>Right to withdraw consent</li>
                <li>Right to lodge a complaint with a supervisory authority</li>
              </ul>
              <p className="mt-4">
                Our legal basis for processing your data includes: performance of contract,
                legitimate interests, and consent (where applicable).
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.2 CCPA (California)
              </h3>
              <p>
                If you are a California resident, you have rights under the California Consumer
                Privacy Act (CCPA):
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Right to know what personal information is collected</li>
                <li>Right to know if personal information is sold or disclosed</li>
                <li>Right to opt-out of the sale of personal information (we do not sell data)</li>
                <li>Right to deletion</li>
                <li>Right to non-discrimination for exercising CCPA rights</li>
              </ul>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.3 Other Regions
              </h3>
              <p>
                We respect privacy rights under other applicable laws and will comply with valid
                requests in accordance with local regulations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                9. International Data Transfers
              </h2>
              <p>
                Your information may be transferred to and processed in countries other than
                your country of residence, including the United States. These countries may have
                data protection laws that differ from your jurisdiction.
              </p>
              <p className="mt-4">
                We use appropriate safeguards for international data transfers, including:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
                <li>Adequacy decisions for certain countries</li>
                <li>Certification mechanisms where available</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                10. Children's Privacy
              </h2>
              <p>
                The Service is not intended for individuals under the age of 18. We do not
                knowingly collect personal information from children. If you become aware that
                a child has provided us with personal information, please contact us at
                privacy@interviewlm.com, and we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                11. Third-Party Links
              </h2>
              <p>
                The Service may contain links to third-party websites or services that are not
                operated by us. We are not responsible for the privacy practices of these third
                parties. We encourage you to review the privacy policies of any third-party sites
                you visit.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                12. Changes to This Privacy Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our
                practices or legal requirements. We will notify you of material changes by:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Email notification to your registered email address</li>
                <li>Prominent notice on the Service</li>
                <li>Updating the "Last Updated" date at the top of this policy</li>
              </ul>
              <p className="mt-4">
                Your continued use of the Service after changes become effective constitutes
                acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                13. Contact Us
              </h2>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or
                our data practices, please contact us:
              </p>
              <div className="mt-4 p-4 bg-background-secondary border border-border rounded-lg space-y-2">
                <p className="font-medium text-text-primary">InterviewLM Privacy Team</p>
                <p><strong>Email:</strong> privacy@interviewlm.com</p>
                <p><strong>General Support:</strong> support@interviewlm.com</p>
                <p><strong>Data Protection Officer:</strong> dpo@interviewlm.com</p>
              </div>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                Response Time
              </h3>
              <p>
                We will respond to privacy requests within 30 days. For GDPR requests, we will
                respond within one month (extendable by two additional months for complex requests).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                14. Data Processing Addendum (For Customers)
              </h2>
              <p>
                For Customers who use the Service to process Candidate data, we act as a data
                processor. A Data Processing Addendum (DPA) is available upon request and forms
                part of our service agreement. The DPA includes:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Details of processing activities</li>
                <li>Security measures and certifications</li>
                <li>Sub-processor list</li>
                <li>Data subject rights assistance</li>
                <li>Data breach notification procedures</li>
                <li>Standard Contractual Clauses (where applicable)</li>
              </ul>
              <p className="mt-4">
                Contact legal@interviewlm.com to request a DPA.
              </p>
            </section>

            <div className="mt-12 p-6 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary text-center">
                This Privacy Policy was last updated on {new Date().toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                })}.
                We are committed to protecting your privacy and handling your data with care and transparency.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
