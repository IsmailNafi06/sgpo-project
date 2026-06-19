package sgpo.services;

import org.springframework.web.multipart.MultipartFile;
import sgpo.exceptions.CsvException;

import java.io.ByteArrayInputStream;

public interface CsvService {
    ByteArrayInputStream exportNodes() throws CsvException;
    void importNodes(MultipartFile file) throws CsvException;

    ByteArrayInputStream exportEdges() throws CsvException;
    void importEdges(MultipartFile file) throws CsvException;
}