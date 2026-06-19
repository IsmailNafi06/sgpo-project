package sgpo.services;

import sgpo.exceptions.DataImportException;

public interface DataImportService {
    void importAllData() throws DataImportException;
}
