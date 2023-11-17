
class ParsingError(Exception):
    def __init__(self, message):
        self.message = message

class OrchestrationError(Exception):
    def __init__(self, message):
        self.message = message
