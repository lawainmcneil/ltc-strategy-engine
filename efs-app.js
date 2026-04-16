const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0
});

const wholeNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

const moneyInputKeys = ["totalAssets", "liquidAssets", "income", "legacyGoal", "homeValue", "fundingDeposit"];

const elements = {
  state: document.querySelector("#state"),
  age: document.querySelector("#age"),
  maritalStatus: document.querySelector("#maritalStatus"),
  totalAssets: document.querySelector("#totalAssets"),
  liquidAssets: document.querySelector("#liquidAssets"),
  income: document.querySelector("#income"),
  careType: document.querySelector("#careType"),
  horizon: document.querySelector("#horizon"),
  legacyGoal: document.querySelector("#legacyGoal"),
  homeValue: document.querySelector("#homeValue"),
  inflationEnabled: document.querySelector("#inflationEnabled"),
  inflationRate: document.querySelector("#inflationRate"),
  fundingDeposit: document.querySelector("#fundingDeposit"),
  benefitLeverage: document.querySelector("#benefitLeverage")
};

const output = {
  annualCost: document.querySelector("#annualCost"),
  monthlyCost: document.querySelector("#monthlyCost"),
  projectedCost: document.querySelector("#projectedCost"),
  stateCompare: document.querySelector("#stateCompare"),
  liquidExposure: document.querySelector("#liquidExposure"),
  totalExposure: document.querySelector("#totalExposure"),
  remainingAssets: document.querySelector("#remainingAssets"),
  depletionTimeline: document.querySelector("#depletionTimeline"),
  legacyImpact: document.querySelector("#legacyImpact"),
  preservedAssets: document.querySelector("#preservedAssets"),
  ltcBenefitPool: document.querySelector("#ltcBenefitPool"),
  leverageReadout: document.querySelector("#leverageReadout"),
  unfundedExposure: document.querySelector("#unfundedExposure"),
  summaryScenario: document.querySelector("#summaryScenario"),
  summaryHeadline: document.querySelector("#summaryHeadline"),
  summaryTotalRisk: document.querySelector("#summaryTotalRisk"),
  summaryLiquidRisk: document.querySelector("#summaryLiquidRisk"),
  summaryPreserved: document.querySelector("#summaryPreserved"),
  summarySentence: document.querySelector("#summarySentence"),
  attorneyLens: document.querySelector("#attorneyLens"),
  inflationLabel: document.querySelector("#inflationLabel"),
  leverageLabel: document.querySelector("#leverageLabel")
};

let impactChart;

const numericValue = (input, fallback = 0) => {
  const value = Number(String(input.value).replace(/,/g, ""));
  return Number.isFinite(value) ? value : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatMoneyInput = (input) => {
  const value = numericValue(input, 0);
  input.value = value > 0 ? wholeNumber.format(value) : "";
};

const populateStates = () => {
  Object.entries(LTC_COSTS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([abbr, state]) => {
      const option = document.createElement("option");
      option.value = abbr;
      option.textContent = state.name;
      elements.state.appendChild(option);
    });
  elements.state.value = "GA";
};

const projectedCareCost = (annualCost, years, inflationRate) => {
  let total = 0;
  for (let year = 0; year < years; year += 1) {
    total += annualCost * Math.pow(1 + inflationRate, year);
  }
  return total;
};

const getScenario = () => {
  const careType = elements.careType.value;
  const selectedState = LTC_COSTS[elements.state.value];
  const annualCost = selectedState[careType];
  const horizon = numericValue(elements.horizon, 5);
  const inflationRate = elements.inflationEnabled.checked ? numericValue(elements.inflationRate, 0) / 100 : 0;
  const totalAssets = Math.max(0, numericValue(elements.totalAssets, 0));
  const liquidAssets = Math.max(1, numericValue(elements.liquidAssets, 1));
  const fundingDeposit = Math.max(0, numericValue(elements.fundingDeposit, 0));
  const benefitLeverage = numericValue(elements.benefitLeverage, 3);
  const grossCost = projectedCareCost(annualCost, horizon, inflationRate);
  const ltcBenefitPool = fundingDeposit * benefitLeverage;
  const strategyCost = Math.max(0, grossCost - ltcBenefitPool);
  const legacyGoal = Math.max(0, numericValue(elements.legacyGoal, 0));

  return {
    selectedState,
    stateAbbr: elements.state.value,
    careType,
    careLabel: CARE_LABELS[careType],
    annualCost,
    horizon,
    inflationRate,
    totalAssets,
    liquidAssets,
    income: numericValue(elements.income, 0),
    age: numericValue(elements.age, 68),
    maritalStatus: elements.maritalStatus.value,
    homeValue: numericValue(elements.homeValue, 0),
    fundingDeposit,
    benefitLeverage,
    ltcBenefitPool,
    grossCost,
    strategyCost,
    legacyGoal,
    remainingWithoutPlan: Math.max(0, totalAssets - grossCost),
    remainingWithPlan: Math.max(0, totalAssets - strategyCost)
  };
};

const buildChartData = (scenario) => {
  const labels = [];
  const noPlanning = [];
  const planning = [];
  let noPlanningAssets = scenario.totalAssets;
  let planningAssets = scenario.totalAssets;
  let benefitRemaining = scenario.ltcBenefitPool;

  for (let year = 0; year <= scenario.horizon; year += 1) {
    labels.push(`Year ${year}`);
    noPlanning.push(Math.max(0, Math.round(noPlanningAssets)));
    planning.push(Math.max(0, Math.round(planningAssets)));

    const annualDraw = scenario.annualCost * Math.pow(1 + scenario.inflationRate, year);
    const benefitApplied = Math.min(annualDraw, benefitRemaining);
    const outOfPocketDraw = annualDraw - benefitApplied;
    benefitRemaining -= benefitApplied;
    noPlanningAssets -= annualDraw;
    planningAssets -= outOfPocketDraw;
  }

  return { labels, noPlanning, planning };
};

const updateChart = (scenario) => {
  const chartData = buildChartData(scenario);

  impactChart.data.labels = chartData.labels;
  impactChart.data.datasets[0].data = chartData.noPlanning;
  impactChart.data.datasets[1].data = chartData.planning;
  impactChart.update();
};

const riskLevel = (totalExposure) => {
  if (totalExposure >= 0.5) return "critical";
  if (totalExposure >= 0.25) return "material";
  return "manageable";
};

const updateOutputs = () => {
  const scenario = getScenario();
  const nationalAverage = NATIONAL_AVERAGES[scenario.careType];
  const compareRatio = (scenario.annualCost - nationalAverage) / nationalAverage;
  const liquidExposure = scenario.grossCost / scenario.liquidAssets;
  const totalExposure = scenario.totalAssets > 0 ? scenario.grossCost / scenario.totalAssets : 0;
  const depletionYears = scenario.annualCost > 0 ? scenario.liquidAssets / scenario.annualCost : 0;
  const legacyGap = Math.max(0, scenario.legacyGoal - scenario.remainingWithoutPlan);
  const preserved = scenario.remainingWithPlan - scenario.remainingWithoutPlan;
  const unfundedExposure = Math.max(0, scenario.grossCost - scenario.ltcBenefitPool);
  const level = riskLevel(totalExposure);

  output.annualCost.textContent = currency.format(scenario.annualCost);
  output.monthlyCost.textContent = `${currency.format(scenario.annualCost / 12)} per month`;
  output.projectedCost.textContent = currency.format(scenario.grossCost);
  output.stateCompare.textContent = `${scenario.selectedState.name} is ${Math.abs(compareRatio * 100).toFixed(0)}% ${compareRatio >= 0 ? "above" : "below"} the current demo national average for ${scenario.careLabel.toLowerCase()}.`;
  output.liquidExposure.textContent = percent.format(clamp(liquidExposure, 0, 9.99));
  output.totalExposure.textContent = percent.format(clamp(totalExposure, 0, 9.99));
  output.remainingAssets.textContent = currency.format(scenario.remainingWithoutPlan);
  output.depletionTimeline.textContent = `${depletionYears.toFixed(1)} years of care could absorb the listed liquid assets before other resources are considered.`;
  output.legacyImpact.textContent = legacyGap > 0
    ? `${currency.format(legacyGap)} of the stated legacy goal would need another source of protection.`
    : "The stated legacy goal remains mathematically intact in this scenario, before taxes, markets, and legal costs.";
  output.preservedAssets.textContent = currency.format(preserved);
  output.ltcBenefitPool.textContent = currency.format(scenario.ltcBenefitPool);
  output.leverageReadout.textContent = `${currency.format(scenario.fundingDeposit)} repositioned at ${scenario.benefitLeverage.toFixed(2).replace(/\.00$/, "")}:1 modeled benefit leverage.`;
  output.unfundedExposure.textContent = currency.format(unfundedExposure);
  output.summaryScenario.textContent = `${scenario.selectedState.name} / ${scenario.careLabel} / ${scenario.horizon}-year horizon`;
  output.summaryHeadline.textContent = `A ${scenario.horizon}-year care event could put ${currency.format(scenario.grossCost)} in motion.`;
  output.summaryTotalRisk.textContent = percent.format(clamp(totalExposure, 0, 9.99));
  output.summaryLiquidRisk.textContent = percent.format(clamp(liquidExposure, 0, 9.99));
  output.summaryPreserved.textContent = currency.format(preserved);
  output.summarySentence.textContent = `A ${currency.format(scenario.fundingDeposit)} asset-based LTC allocation modeled at ${scenario.benefitLeverage.toFixed(2).replace(/\.00$/, "")}:1 may create ${currency.format(scenario.ltcBenefitPool)} of dedicated care benefits.`;
  output.attorneyLens.textContent = level === "critical"
    ? "This exposure could materially change estate execution, beneficiary expectations, and family administration duties."
    : level === "material"
      ? "This exposure deserves coordination before documents are tested by a real care event."
      : "The numbers are not panic points. They are planning inputs that help preserve options.";
  output.inflationLabel.textContent = `${numericValue(elements.inflationRate, 0).toFixed(1)}%`;
  output.leverageLabel.textContent = `${numericValue(elements.benefitLeverage, 3).toFixed(2).replace(/\.00$/, "")}:1`;

  updateChart(scenario);
};

const initChart = () => {
  const context = document.querySelector("#impactChart");
  impactChart = new Chart(context, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "No Planning",
          data: [],
          borderColor: "#b42318",
          backgroundColor: "rgba(180, 35, 24, 0.12)",
          fill: true,
          tension: 0.28,
          pointRadius: 4
        },
        {
          label: "Asset-Based LTC Strategy",
          data: [],
          borderColor: "#2f6b1f",
          backgroundColor: "rgba(47, 107, 31, 0.12)",
          fill: true,
          tension: 0.28,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#f5f7f3",
            font: { size: 13, weight: "600" }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${currency.format(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.08)" },
          ticks: { color: "#f5f7f3" }
        },
        y: {
          grid: { color: "rgba(255,255,255,0.08)" },
          ticks: {
            color: "#f5f7f3",
            callback: (value) => currency.format(value)
          }
        }
      }
    }
  });
};

const wireEvents = () => {
  Object.values(elements).forEach((element) => {
    element.addEventListener("input", updateOutputs);
    element.addEventListener("change", updateOutputs);
  });

  moneyInputKeys.forEach((key) => {
    elements[key].addEventListener("blur", () => {
      formatMoneyInput(elements[key]);
      updateOutputs();
    });
  });

  document.querySelector("#startDrill").addEventListener("click", () => {
    document.querySelector("#walkthrough").scrollIntoView({ behavior: "smooth" });
  });

  document.querySelector("#printSummary").addEventListener("click", () => window.print());
};

populateStates();
initChart();
wireEvents();
moneyInputKeys.forEach((key) => formatMoneyInput(elements[key]));
updateOutputs();
