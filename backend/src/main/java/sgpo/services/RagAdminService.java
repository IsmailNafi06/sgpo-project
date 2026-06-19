package sgpo.services;

import org.springframework.web.multipart.MultipartFile;

public interface RagAdminService {
    String uploadAndIngestDocument(MultipartFile file) throws Exception;
}
