import { Button, Group } from '@mantine/core';
import React, { useState, useEffect } from 'react';
import { flushEvents } from '../../../flushEvents';
import type { EventFilters } from '../../../hooks/useEvents';
import * as classes from './eventsTabTop.module.css';

export function EventsTabTop({
  filters,
  onFiltersChange,
  clear,
}: {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  clear: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [params, setParams] = useState<string[]>(filters.query.trim().split(' ').filter(Boolean));

  useEffect(() => {
    const newParams = inputValue.trim().split(' ').filter(Boolean);
    if (inputValue.endsWith(' ')) {
      setParams([...params, ...newParams]);
      setInputValue('');
      onFiltersChange({ ...filters, query: [...params, ...newParams].join(' ') });
    }
  }, [inputValue]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.currentTarget.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && inputValue === '') {
      event.preventDefault();
      if (params.length > 0) {
        const lastParam = params[params.length - 1];
        const newParams = params.slice(0, -1);
        setParams(newParams);
        setInputValue(lastParam);
        onFiltersChange({ ...filters, query: newParams.join(' ') });
      }
    }
  };

  const handleInputBlur = () => {
    if (inputValue.trim() !== '') {
      const newParams = [...params, inputValue.trim()];
      setParams(newParams);
      setInputValue('');
      onFiltersChange({ ...filters, query: newParams.join(' ') });
    }
  };

  return (
    <Group className="dd-privacy-allow">
      <div className={classes.inputWrapper}>
      {params.map((param, index) => (
        <span key={index} className={classes.paramBox}>
          <span className={classes.highlight}>{param}</span>
          {param.includes(':') && param.split(':')[1] === '' && (
            <span className={classes.warning}>⚠️</span>
          )}
        </span>
      ))}
        <input
          type="text"
          placeholder="Filter your events, syntax: 'type:view application.id:40d8ca4b'"
          value={inputValue}
          className={classes.textInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          data-dd-privacy="mask"
        />
      </div>

      <Button color="violet" variant="light" onClick={flushEvents}>
        Flush
      </Button>
      <Button color="red" variant="light" onClick={clear}>
        Clear
      </Button>
    </Group>
  );
}
