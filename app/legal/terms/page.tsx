import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - InterviewLM",
  description: "Terms of Service for InterviewLM AI-powered interview platform",
};

export default function TermsOfServicePage() {
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
            Terms of Service
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
                1. Acceptance of Terms
              </h2>
              <p>
                By accessing or using InterviewLM ("Service", "Platform", "we", "us", or "our"),
                you agree to be bound by these Terms of Service ("Terms"). If you disagree with
                any part of these terms, you may not access the Service.
              </p>
              <p className="mt-4">
                These Terms apply to all visitors, users, and others who access or use the Service,
                including organizations that purchase assessment credits ("Customers") and
                individuals who participate in interviews ("Candidates").
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                2. Description of Service
              </h2>
              <p>
                InterviewLM provides an AI-powered technical assessment platform that enables
                organizations to evaluate candidates' coding abilities and AI tool proficiency
                through interactive coding interviews. The Service includes:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Online coding environment with AI assistant integration</li>
                <li>Automated test case evaluation</li>
                <li>Session recording and playback</li>
                <li>Candidate evaluation and analytics</li>
                <li>Assessment management tools</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                3. User Accounts and Registration
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.1 Account Creation
              </h3>
              <p>
                To use certain features of the Service, you must register for an account.
                You agree to provide accurate, current, and complete information during the
                registration process and to update such information to keep it accurate,
                current, and complete.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.2 Account Security
              </h3>
              <p>
                You are responsible for safeguarding the password you use to access the Service
                and for any activities or actions under your account. You agree not to disclose
                your password to any third party and to notify us immediately upon becoming aware
                of any breach of security or unauthorized use of your account.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                3.3 Account Eligibility
              </h3>
              <p>
                You must be at least 18 years old to use this Service. By using the Service,
                you represent and warrant that you are at least 18 years of age.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                4. Pricing and Payment
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.1 Assessment Credits
              </h3>
              <p>
                The Service operates on a pay-per-assessment model. Customers purchase assessment
                credits which can be used to conduct technical interviews. Credits do not expire
                unless explicitly stated in your purchase agreement.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.2 Pricing
              </h3>
              <p>
                Current pricing is available on our{" "}
                <Link href="/pricing" className="text-primary hover:text-primary-hover">
                  pricing page
                </Link>
                . We reserve the right to modify our pricing at any time. Price changes will
                not affect credits already purchased.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.3 Payment Processing
              </h3>
              <p>
                Payments are processed through third-party payment processors. You agree to
                provide current, complete, and accurate purchase and account information for
                all purchases. You agree to promptly update your account and payment information
                as necessary for successful transactions.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                4.4 Refunds
              </h3>
              <p>
                Unused assessment credits may be refunded within 30 days of purchase. Once an
                assessment credit has been used to conduct an interview, it is non-refundable.
                Contact support@interviewlm.com for refund requests.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                5. Acceptable Use Policy
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                5.1 Permitted Use
              </h3>
              <p>
                You may use the Service only for lawful purposes and in accordance with these
                Terms. You agree to use the Service solely for evaluating technical candidates
                as part of your hiring process.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                5.2 Prohibited Activities
              </h3>
              <p>You agree NOT to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe upon the rights of others, including intellectual property rights</li>
                <li>Attempt to gain unauthorized access to the Service or related systems</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems (bots, scrapers) without explicit permission</li>
                <li>Share or resell your account access to third parties</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Use the Service to discriminate against candidates based on protected characteristics</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                6. Intellectual Property Rights
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.1 Service Ownership
              </h3>
              <p>
                The Service and its original content (excluding User Content), features, and
                functionality are and will remain the exclusive property of InterviewLM and its
                licensors. The Service is protected by copyright, trademark, and other laws.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.2 User Content
              </h3>
              <p>
                You retain all rights to any code, solutions, or content that candidates create
                during interviews ("User Content"). By using the Service, you grant us a
                non-exclusive, worldwide, royalty-free license to store, process, and display
                User Content solely for the purpose of providing the Service.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                6.3 Problem Seeds
              </h3>
              <p>
                InterviewLM provides a library of coding problems ("Problem Seeds"). While you
                may use these problems for your assessments, you may not copy, redistribute, or
                create derivative works from Problem Seeds outside of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                7. Data Privacy and Security
              </h2>
              <p>
                Your use of the Service is also governed by our{" "}
                <Link href="/legal/privacy" className="text-primary hover:text-primary-hover">
                  Privacy Policy
                </Link>
                . We take data security seriously and implement industry-standard measures to
                protect your data. However, no method of transmission over the Internet is 100%
                secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                8. Session Recording and Candidate Data
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.1 Recording Notice
              </h3>
              <p>
                All interview sessions are recorded, including code changes, AI chat interactions,
                terminal commands, and test results. Candidates are notified of this recording
                before beginning their interview.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.2 Data Retention
              </h3>
              <p>
                Session recordings and candidate data are retained for the duration specified in
                your service agreement, typically 12 months, unless otherwise required by law or
                requested for deletion by the Customer.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                8.3 Customer Responsibilities
              </h3>
              <p>
                As a Customer, you are responsible for complying with all applicable employment
                laws and regulations in your jurisdiction when using the Service to evaluate
                candidates. This includes but is not limited to anti-discrimination laws, data
                protection regulations (GDPR, CCPA, etc.), and employment screening requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                9. Service Availability and Support
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                9.1 Uptime
              </h3>
              <p>
                We strive to maintain 99.9% uptime for the Service, but we do not guarantee
                uninterrupted availability. We reserve the right to modify, suspend, or
                discontinue the Service at any time with reasonable notice.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                9.2 Maintenance
              </h3>
              <p>
                We may perform scheduled maintenance that temporarily interrupts Service
                availability. We will provide advance notice of scheduled maintenance when
                possible.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                9.3 Support
              </h3>
              <p>
                Email support is available at support@interviewlm.com. Enterprise customers
                may receive priority support based on their service agreement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                10. Limitation of Liability
              </h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL INTERVIEWLM, ITS
                AFFILIATES, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT,
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT
                LIMITATION, LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES,
                RESULTING FROM:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Your access to or use of or inability to access or use the Service</li>
                <li>Any conduct or content of any third party on the Service</li>
                <li>Any content obtained from the Service</li>
                <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              </ul>
              <p className="mt-4">
                OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE
                SHALL NOT EXCEED THE AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING
                THE CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                11. Indemnification
              </h2>
              <p>
                You agree to defend, indemnify, and hold harmless InterviewLM and its affiliates,
                and their respective officers, directors, employees, and agents from and against
                any claims, liabilities, damages, losses, and expenses, including reasonable
                attorneys' fees and costs, arising out of or in any way connected with:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Your access to or use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights, including intellectual property rights</li>
                <li>Your violation of any applicable laws or regulations</li>
                <li>Any employment decisions you make based on assessment results</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                12. Termination
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                12.1 Termination by You
              </h3>
              <p>
                You may terminate your account at any time by contacting support@interviewlm.com.
                Upon termination, unused credits may be refunded as described in Section 4.4.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                12.2 Termination by Us
              </h3>
              <p>
                We may terminate or suspend your account immediately, without prior notice or
                liability, for any reason, including if you breach these Terms. Upon termination,
                your right to use the Service will immediately cease.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                12.3 Effect of Termination
              </h3>
              <p>
                Upon termination, we will provide you with access to export your data for a
                period of 30 days. After this period, we may delete your data in accordance
                with our retention policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                13. Dispute Resolution
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                13.1 Governing Law
              </h3>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of
                the State of Delaware, United States, without regard to its conflict of law
                provisions.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                13.2 Arbitration
              </h3>
              <p>
                Any dispute arising from these Terms or your use of the Service shall be resolved
                through binding arbitration in accordance with the American Arbitration Association's
                rules, except that either party may seek injunctive or other equitable relief in
                a court of competent jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                14. Changes to Terms
              </h2>
              <p>
                We reserve the right to modify or replace these Terms at any time. If a revision
                is material, we will provide at least 30 days' notice prior to any new terms
                taking effect. What constitutes a material change will be determined at our sole
                discretion.
              </p>
              <p className="mt-4">
                By continuing to access or use our Service after revisions become effective, you
                agree to be bound by the revised terms. If you do not agree to the new terms,
                please stop using the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                15. Miscellaneous
              </h2>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                15.1 Entire Agreement
              </h3>
              <p>
                These Terms, together with our Privacy Policy, constitute the entire agreement
                between you and InterviewLM regarding the Service and supersede all prior
                agreements and understandings.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                15.2 Severability
              </h3>
              <p>
                If any provision of these Terms is held to be invalid or unenforceable, such
                provision shall be struck and the remaining provisions shall be enforced.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                15.3 Waiver
              </h3>
              <p>
                Our failure to enforce any right or provision of these Terms will not be considered
                a waiver of those rights.
              </p>

              <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3">
                15.4 Assignment
              </h3>
              <p>
                You may not assign or transfer these Terms without our prior written consent.
                We may assign our rights and obligations under these Terms without restriction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-text-primary mt-8 mb-4">
                16. Contact Information
              </h2>
              <p>
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-background-secondary border border-border rounded-lg">
                <p className="font-medium text-text-primary">InterviewLM</p>
                <p className="mt-1">Email: legal@interviewlm.com</p>
                <p>Support: support@interviewlm.com</p>
              </div>
            </section>

            <div className="mt-12 p-6 bg-background-secondary border border-border rounded-lg">
              <p className="text-sm text-text-tertiary text-center">
                By using InterviewLM, you acknowledge that you have read, understood, and agree
                to be bound by these Terms of Service.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
