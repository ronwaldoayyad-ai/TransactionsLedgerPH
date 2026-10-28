// Notify the optional GPU border after the complete borrower/desktop render.
const positionFinderBeforeNavigationPolish=positionFinder;
positionFinder=()=>{if(finderCompact&&dashboardOrbitEligible())return;positionFinderBeforeNavigationPolish();};
const renderBeforeNavigationPolish=render;
render=()=>{renderBeforeNavigationPolish();window.dispatchEvent(new Event('loanledger-screen-rendered'));};
