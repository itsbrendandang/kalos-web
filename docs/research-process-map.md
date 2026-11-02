# Research brief: process-optimization-first lab/process platform

> Written by a research agent from memory, **without browsing**. Vendor facts, the Dotmatics/Siemens and Strateos claims, the FDA AI guidance date, the Annex 11 status and every paper citation are **unverified**. Check each before using it in customer-facing material or in the app. The mAb ranges are indicative literature values, not validated specs.

## 1. Incumbents and where a process-first tool differs
- **Benchling**: cloud ELN/LIMS, strong on sequences/entities, notebooks, inventory, workflows, API. No native process (unit-op) model or optimizer.
- **Quartzy**: lab inventory and reagent ordering. Not a process or experiment-design tool.
- **TetraScience**: instrument/data ingestion and harmonization (Allotrope). A data-plumbing layer; a model for ingesting CDMO data.
- **BIOVIA**: enterprise suite (ELN, Pipeline Pilot, process simulation); heavy, compliance-strong, slow to deploy.
- **Dotmatics**: data/ELN/registration; possibly acquired by Siemens in 2025 (unverified).
- **Sapio Sciences**: configurable LIMS/ELN common in biologics.
- **Strateos**: robotic cloud lab; may have wound down around 2023 (unverified).

**Difference:** the primary object is the *process* (unit-op graph with CPPs, CQAs, ranges); the output is a *decision*, not a record; CDMO/CRO runs are *black boxes with typed inputs and outputs*; the wedge is bioprocess development, not general ELN.

## 2. mAb unit-operation chain (indicative; Kelley, mAbs 2009;1(5):443-452; Li et al., mAbs 2010;2(5):466-479)
| Step | Key CPPs | Indicative range | Outputs |
|---|---|---|---|
| Cell line | clone criteria, amplification, passage | titer 1-5 g/L early | titer, growth, stability |
| Seed train | split ratio, inoculation density, T, DO, pH | 0.3-0.5 e6 cells/mL; 36.5-37 C; pH 6.9-7.2; DO 30-50% | VCD, viability |
| Upstream fed-batch (~14 d) | T (+ shift), pH, DO, feed, glucose, osmolality | shift 30-36 C; pH 6.8-7.2; DO 30-60%; glucose 2-6 g/L; 300-450 mOsm/kg | peak VCD, viability, titer 3-10 g/L, glycosylation |
| Harvest | depth filter, load, flux, centrifuge, hold | per vendor | turbidity, HCP, DNA, recovery |
| Protein A capture | load 30-60 g/L resin, residence 2-6 min, elution pH | elution pH 3.0-3.6 | yield, HCP, aggregate |
| Viral inactivation | low-pH hold | pH 3.5 +/- 0.1, ~60 min | log reduction |
| Polish (CEX/AEX) | load pH/conductivity, density | resin-specific | HCP, DNA, aggregate, charge variants |
| Viral filtration | pressure, load | vendor | viral clearance |
| UF/DF | TMP, cross-flow, concentration, DV | TMP 15-25 psi; 50-100 g/L; 7-10 DV | concentration, yield |
| Fill-finish | sterile filter, volume, pH, excipients | 0.22 um; pH 5.5-6.5; PS80 0.01-0.04% | bioburden, particulates, potency |

The end-to-end path question is mostly categorical (in-house vs CDMO, resin vendor, scale, step order).

## 3. Multi-step BO: realistic v1
Methods (unverified citations): multi-fidelity (Kandasamy 2017; BoTorch `SingleTaskMultiFidelityGP`); cost-aware acquisition (`botorch.acquisition.cost_aware`); transfer (Feurer 2018 arXiv:1802.02219; RGPE Wistuba 2018, custom; `MultiTaskGP`); composite/function-network BO (Astudillo & Frazier 2019, 2021; custom); constraints (Gardner 2014; constrained EI); batch (`qLogEI`, `qNEI`); high-dim (TuRBO); mixed categorical/continuous (Ax).

**v1:** per-unit-op constrained GP BO with batch proposals (reuse the Kalos engine), seeded from published ranges, plus a simple stage-wise surrogate that takes the previous step's measured outputs as inputs. Add a categorical route/vendor variable only after data from at least two CDMOs. Defer RGPE, function networks and multi-fidelity. Validate on historical data with leave-one-campaign-out before showing recommendations.

## 4. SOP and partner-data extraction
- Template/controlled vocabulary first. Rules for number+unit patterns; normalize units (pint/UCUM). LLM only for prose/tables, schema-constrained, every value cites a source span and is rejected if the span does not match. A human confirms each parameter; keep a 20-30 SOP gold set to measure precision/recall; log reviewer decision and SOP version.
- Formats: batch records/MES exports, CoAs (often scanned PDF), drifting Excel templates, HPLC/CE and historian exports.
- Pitfalls: g/L vs mg/mL; 1e6 vs 1e5 cells/mL; mOsm/kg vs /L; process day vs hour vs clock time; timezones; censored values (<LOQ) must be flagged, not zeroed; assay identity (Protein A HPLC vs ELISA titer); locale decimals; merged Excel cells; scale (2 L vs 200 L); lot vs batch vs run IDs; partner step names mapped to your ontology with a versioned table.

## 5. Regulatory and confidentiality
21 CFR Part 11; ALCOA+; FDA data integrity guidance (2018); EU GMP Annex 11; ICH Q8-Q11 (an "optimal range" can become a design-space claim); FDA draft AI guidance (Jan 2025, unverified). Keep v1 research-use-only with an append-only audit log, versioned records, unique user identity, no e-signatures yet. Partner data isolation; on-device by default, explicit sync.

## Ranked first 5 features
1. Process model + versioned parameter spec (source-linked to SOP).
2. Partner result ingestion with normalization (units, time base, censored values, assay IDs).
3. Per-unit-op constrained BO with batch proposals (+ stage-wise surrogate).
4. Audit trail and partner-isolated workspaces.
5. SOP extraction assist (rules + schema-constrained LLM, span-cited, human-verified).
