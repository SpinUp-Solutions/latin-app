'use client';
import { createContext, useContext } from 'react';
const SectionedTestContext = createContext(false);
export const SectionedTestProvider = SectionedTestContext.Provider;
export const useSectionedTest = () => useContext(SectionedTestContext);
