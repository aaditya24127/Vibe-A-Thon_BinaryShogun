import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { LiveOperationsSection } from "@/components/landing/LiveOperationsSection";
import { ImpactSection } from "@/components/landing/ImpactSection";
import { Footer } from "@/components/landing/Footer";

// The landing page must use the exact brand spelling and the illustrative
// demo values from the brief — these are the rules a backend integration
// must preserve.
describe("WeConnect landing page", () => {
  it("spells the brand WeConnect in the header, hero and footer", () => {
    render(
      <>
        <Header />
        <HeroSection />
        <Footer />
      </>,
    );
    expect(screen.getAllByText("WeConnect").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Before It.s Too Late\./).length).toBeGreaterThan(0);
    expect(screen.queryByText(/WEV/i)).toBeNull();
    expect(screen.queryByText("We Connect")).toBeNull();
  });

  it("shows the hero CTA and three benefit labels", () => {
    render(<HeroSection />);
    expect(screen.getAllByText("Explore the Platform").length).toBeGreaterThan(0);
    expect(screen.getByText("Less Waste")).toBeInTheDocument();
    expect(screen.getByText("Faster Deliveries")).toBeInTheDocument();
    expect(screen.getByText("Stronger Communities")).toBeInTheDocument();
  });

  it("renders the section headings", () => {
    render(
      <>
        <SolutionSection />
        <LiveOperationsSection />
        <ImpactSection />
      </>,
    );
    expect(screen.getByText(/What We Do At/)).toBeInTheDocument();
    expect(screen.getByText(/See/)).toHaveTextContent("See Aid in Action");
    expect(screen.getByText(/Turning Surplus Into/)).toBeInTheDocument();
  });

  it("shows the illustrative operations metrics", () => {
    render(<LiveOperationsSection />);
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("Active Riders")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("Ongoing Deliveries")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Receiving Shelters")).toBeInTheDocument();
  });

  it("shows the impact metrics", () => {
    render(<ImpactSection />);
    expect(screen.getByText("1,200+")).toBeInTheDocument();
    expect(screen.getByText("Meals Delivered")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("Less Food Waste")).toBeInTheDocument();
    expect(screen.getByText("25+")).toBeInTheDocument();
    expect(screen.getByText("12+")).toBeInTheDocument();
  });

  it("shows the footer copyright year 2026", () => {
    render(<Footer />);
    expect(screen.getByText(/© 2026 WeConnect\. All rights reserved\./)).toBeInTheDocument();
  });
});
