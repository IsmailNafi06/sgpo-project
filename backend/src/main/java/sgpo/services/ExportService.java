package sgpo.services;

import sgpo.dtos.CheminDTO;
import sgpo.exceptions.ExportException;

public interface ExportService {
    byte[] generatePdf(CheminDTO chemin) throws ExportException;
}
